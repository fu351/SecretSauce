#!/usr/bin/env python3
"""
calibrate_recommender_lr.py
===========================
Learn recommender weights from calibration data using logistic regression.

How this fits the existing flow
-------------------------------
1. ``calibrate_recommender.py`` runs each engine on each GT image and writes
   ``calibration_results.json`` (per-image accuracy, latency, features).
2. THIS script reads that file, treats each image as a training example
   (features → best_engine label), trains a multinomial LR, and writes a
   new ``recommender_config.json`` with weights that minimise classification
   error on the calibration set.
3. ``model_recommender.py`` reloads the JSON at import time (already wired
   in the previous low-risk-wins pass), so the new weights take effect on
   the next deploy without a code edit.

Why LR over hand-tuned weights
------------------------------
The hand-tuned weights in the original ``model_recommender.py`` were
chosen by inspection of 8 receipts. With ≥30 calibration receipts an LR
captures the actual feature → engine relationship empirically and gives
us calibrated probabilities (which we surface as recommender confidence).

Tradeoffs:
- LR can't capture interactions (e.g. "thermal AND low-contrast →
  ensemble"). For that we'd need GBM/XGBoost. Not worth it until we have
  ≥200 examples and a regression test set.
- LR is interpretable: each feature has a single coefficient that maps
  cleanly to the existing weight slots in recommender_config.json.

Statistical floor
-----------------
This script REFUSES to write weights when the calibration set has fewer
than ``MIN_TRAINING_EXAMPLES`` images per class (engine). With too little
data the LR overfits and produces worse recommendations than the
hand-tuned defaults. The threshold is conservative — bump it lower only
if you understand the bias/variance tradeoff.

Dependencies
------------
    pip install scikit-learn==1.4.* numpy

Usage
-----
    # After running calibrate_recommender.py:
    python calibrate_recommender_lr.py

    # Train on a different file:
    python calibrate_recommender_lr.py --input alt_calibration.json

    # Dry-run (print weights without writing config):
    python calibrate_recommender_lr.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MIN_TRAINING_EXAMPLES_PER_CLASS = 5

# Features used as LR inputs. Order matters: matches how we read each row
# from calibration_results.json. Add features here only after they're also
# extracted by image_features.py.
_FEATURE_KEYS = [
    "contrast_stddev",
    "skew_angle",
    "laplacian_variance",
    "text_density",
    "estimated_dpi",
    # Booleans coerced to 0/1
    "is_thermal",
    "low_resolution",
]

# Map best-engine label → which weight slot in recommender_config.json to
# adjust. Sign convention from model_recommender.py: positive weights
# favour EasyOCR, negative favour Paddle.
_LABEL_SIGN = {"easyocr": +1.0, "paddle": -1.0, "ensemble": 0.0}


def load_calibration(path: Path) -> list[dict]:
    """Load the per-image calibration rows."""
    if not path.exists():
        sys.exit(
            f"{path} not found. Run calibrate_recommender.py first to produce it."
        )
    data = json.loads(path.read_text())
    rows = data.get("results") if isinstance(data, dict) else data
    if not rows:
        sys.exit(f"{path} contained no result rows.")
    return rows


def best_engine_for_row(row: dict) -> str | None:
    """Pick the empirically best engine for a single image.

    Tie-breakers: accuracy first, then lower latency wins. Returns None
    when the row is incomplete (e.g. paddle never ran — see audit note).
    """
    candidates = []
    for name in ("easyocr", "paddle", "ensemble"):
        acc_key = f"{name}_accuracy"
        time_key = f"{name}_time"
        if acc_key not in row or time_key not in row:
            continue
        # Treat all-zeros as missing (paddle never actually ran in early calibration runs)
        if row[acc_key] == 0.0 and row[time_key] == 0.0:
            continue
        candidates.append((row[acc_key], -row[time_key], name))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][2]


def featurize(row: dict) -> list[float] | None:
    """Extract the feature vector for a row, or None if a key is missing."""
    feats = row.get("features") or {}
    out: list[float] = []
    for k in _FEATURE_KEYS:
        if k == "low_resolution":
            bucket = feats.get("resolution_bucket")
            out.append(1.0 if bucket == "low" else 0.0)
            continue
        v = feats.get(k)
        if v is None:
            return None
        if isinstance(v, bool):
            out.append(1.0 if v else 0.0)
        else:
            out.append(float(v))
    return out


def build_dataset(rows: list[dict]) -> tuple[list[list[float]], list[str]]:
    X: list[list[float]] = []
    y: list[str] = []
    for r in rows:
        label = best_engine_for_row(r)
        if label is None:
            continue
        feats = featurize(r)
        if feats is None:
            continue
        X.append(feats)
        y.append(label)
    return X, y


def train_lr(X: list[list[float]], y: list[str]):
    """Train a multinomial LR. Returns (model, classes, feature_means, feature_stds)."""
    try:
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
    except ImportError as e:
        sys.exit(
            f"Missing dependency: {e}\n  pip install scikit-learn numpy"
        )

    Xa = np.array(X, dtype=np.float64)
    scaler = StandardScaler().fit(Xa)
    Xs = scaler.transform(Xa)

    # L2 with mild regularisation. Multinomial > ovr because we have a 3-way
    # outcome and want calibrated probabilities.
    model = LogisticRegression(
        multi_class="multinomial",
        solver="lbfgs",
        C=1.0,
        max_iter=1000,
    ).fit(Xs, y)
    return model, list(model.classes_), scaler.mean_.tolist(), scaler.scale_.tolist()


def coefficients_to_weights(
    model, classes: list[str], feature_keys: list[str],
) -> dict[str, float]:
    """Project the LR's per-class coefficients onto the existing weight schema.

    The model has shape (n_classes, n_features). For each feature we
    compute a *signed* score = sum_class(coef[class, feature] * sign[class]).
    Positive → favours easyOCR, negative → favours paddle. This maps
    cleanly to the weights in recommender_config.json.

    Each weight is also clamped to a sane range to prevent a single
    overfit example from producing wild values.
    """
    import numpy as np
    coefs = np.array(model.coef_)  # (n_classes, n_features)
    out: dict[str, float] = {}
    for f_idx, feat in enumerate(feature_keys):
        score = 0.0
        for c_idx, c_name in enumerate(classes):
            sign = _LABEL_SIGN.get(c_name, 0.0)
            score += float(coefs[c_idx, f_idx]) * sign
        # Clamp to [-3.0, +3.0] — same dynamic range as the hand-tuned weights.
        out[feat] = max(-3.0, min(3.0, score))
    return out


def project_to_config(weights_by_feat: dict[str, float]) -> dict[str, float]:
    """Translate feature-keyed weights to the recommender_config.json schema.

    The recommender uses *threshold-gated* weights (low_contrast,
    high_contrast, etc.). We approximate by:
      - low_X feature contribution → low_X weight
      - high_X feature contribution → high_X weight (sign-flipped)
      - is_thermal → thermal weight
      - low_resolution → low_resolution weight
    """
    return {
        "low_contrast": +weights_by_feat.get("contrast_stddev", 0.0) * -1,
        "high_contrast": -weights_by_feat.get("contrast_stddev", 0.0) * -1,
        "high_skew": weights_by_feat.get("skew_angle", 0.0),
        "high_noise": weights_by_feat.get("laplacian_variance", 0.0) * -1,
        "low_text_density": weights_by_feat.get("text_density", 0.0) * -1,
        "high_dpi": weights_by_feat.get("estimated_dpi", 0.0),
        "thermal": weights_by_feat.get("is_thermal", 0.0),
        "low_resolution": weights_by_feat.get("low_resolution", 0.0),
        # store_hint stays at the existing default — empirical per-store
        # preferences are populated separately from the same calibration data.
        "store_hint": 2.5,
    }


def per_store_preference(rows: list[dict]) -> dict[str, str]:
    """Empirical per-store preference from the calibration set.

    Per-store: pick the engine that won on >=50% of receipts for that store.
    Falls back to majority-vote across all stores if a tie.
    """
    by_store: dict[str, list[str]] = {}
    for r in rows:
        store = (r.get("ground_truth") or {}).get("store") or r.get("store")
        if not store:
            continue
        label = best_engine_for_row(r)
        if label is None or label == "ensemble":
            continue
        by_store.setdefault(store, []).append(label)

    out: dict[str, str] = {}
    for store, labels in by_store.items():
        easy_n = labels.count("easyocr")
        paddle_n = labels.count("paddle")
        if easy_n > paddle_n:
            out[store] = "easyocr"
        elif paddle_n > easy_n:
            out[store] = "paddle"
        # else: tie → omit, recommender will fall back to feature-based score
    return out


def main() -> int:
    here = Path(__file__).resolve().parent
    default_input = here / "calibration_results.json"
    default_output = here.parent / "recommender_config.json"

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--input", type=Path, default=default_input,
                    help=f"Calibration JSON path (default: {default_input})")
    ap.add_argument("--output", type=Path, default=default_output,
                    help=f"Output config path (default: {default_output})")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print weights without writing the config")
    args = ap.parse_args()

    rows = load_calibration(args.input)
    X, y = build_dataset(rows)

    if not X:
        sys.exit("No usable calibration rows after filtering. Re-run calibrate_recommender.py.")

    # Statistical floor check.
    label_counts: dict[str, int] = {}
    for label in y:
        label_counts[label] = label_counts.get(label, 0) + 1
    min_per_class = min(label_counts.values()) if label_counts else 0
    print(f"Training set: {len(y)} examples across {len(label_counts)} classes", file=sys.stderr)
    for k, v in sorted(label_counts.items()):
        print(f"  {k}: {v}", file=sys.stderr)
    if min_per_class < MIN_TRAINING_EXAMPLES_PER_CLASS:
        sys.exit(
            f"Refusing to train: smallest class has {min_per_class} examples "
            f"(< {MIN_TRAINING_EXAMPLES_PER_CLASS}). Expand the GT set first; "
            "see docs/ocr-pipeline-architecture.md."
        )

    model, classes, _means, _stds = train_lr(X, y)
    feat_weights = coefficients_to_weights(model, classes, _FEATURE_KEYS)
    config_weights = project_to_config(feat_weights)
    store_prefs = per_store_preference(rows)

    new_config = {
        "_comment": "Generated by calibrate_recommender_lr.py — do not hand-edit.",
        "_generated_from": str(args.input),
        "_n_training_examples": len(y),
        "feature_thresholds": {
            "contrast_low": 40.0,
            "contrast_high": 100.0,
            "skew_high_deg": 5.0,
            "laplacian_low": 50.0,
            "text_density_low": 0.02,
            "text_density_high": 0.15,
        },
        "weights": config_weights,
        "score_ensemble_threshold": 2.5,
        "escalation": {"min_items": 2, "checksum_tolerance_dollars": 0.05},
        "store_engine_preference": store_prefs,
    }

    print("\nLearned weights:", file=sys.stderr)
    for k, v in config_weights.items():
        print(f"  {k:>20s}: {v:+.3f}", file=sys.stderr)
    if store_prefs:
        print(f"\nPer-store preferences ({len(store_prefs)}):", file=sys.stderr)
        for k, v in sorted(store_prefs.items()):
            print(f"  {k:>30s}: {v}", file=sys.stderr)

    if args.dry_run:
        print(json.dumps(new_config, indent=2))
    else:
        args.output.write_text(json.dumps(new_config, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
