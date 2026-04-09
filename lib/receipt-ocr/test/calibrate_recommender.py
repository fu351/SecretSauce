#!/usr/bin/env python3
"""
calibrate_recommender.py
========================
Run all test samples through each OCR engine individually AND ensemble,
record per-image accuracy, and output calibration data.

Produces:
  - ``calibration_results.json`` with per-image results and optimal weights
  - A summary table: per-store best engine, overall accuracy, latency savings
  - Suggested ``STORE_ENGINE_PREFERENCE`` dict for model_recommender.py

Usage:
    python calibrate_recommender.py                     # all samples
    python calibrate_recommender.py --images 1.jpg 5.jpg
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

# ── Dynamic imports ─────────────────────────────────────────────────────────

_BASE = Path(__file__).resolve().parent.parent
_TEST_DIR = Path(__file__).resolve().parent

def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod

_bench_mod = _load("ocr_bench", _TEST_DIR / "ocr_bench.py")
_features_mod = _load("image_features", _BASE / "image_features.py")
_recommender_mod = _load("model_recommender", _BASE / "model_recommender.py")

GROUND_TRUTH = _bench_mod.GROUND_TRUTH
SAMPLES_DIR = _bench_mod.SAMPLES_DIR
score_result = _bench_mod.score_result
parse_receipt = _bench_mod.parse_receipt

EasyOCREngine = _bench_mod.EasyOCREngine
PaddleOCREngine = _bench_mod.PaddleOCREngine
EnsembleEngine = _bench_mod.EnsembleEngine

extract_image_features = _features_mod.extract_image_features
recommend_strategy = _recommender_mod.recommend_strategy
Strategy = _recommender_mod.Strategy


def _accuracy(score_row: dict) -> float:
    if score_row["total"] == 0:
        return 0.0
    return score_row["pass"] / score_row["total"]


def run_calibration(images: list[str] | None = None) -> dict:
    """Run all engines on all ground-truth samples and collect per-image results."""

    targets = {k: v for k, v in GROUND_TRUTH.items()
               if images is None or k in images}

    if not targets:
        print("No images to calibrate on.")
        return {}

    # Load engines
    print("Loading EasyOCR engine...")
    easy = EasyOCREngine()
    easy.load()

    print("Loading PaddleOCR engine...")
    try:
        paddle = PaddleOCREngine()
        paddle.load()
        has_paddle = True
    except Exception as e:
        print(f"  PaddleOCR not available: {e}")
        has_paddle = False

    print("Loading Ensemble engine...")
    if has_paddle:
        ensemble = EnsembleEngine()
        ensemble.load()
    else:
        ensemble = None

    results = {}
    for img_name, gt in targets.items():
        img_path = SAMPLES_DIR / img_name
        if not img_path.exists():
            print(f"  [SKIP] {img_name} not found")
            continue

        print(f"\n{'─' * 60}")
        print(f"  {img_name} (store: {gt.get('store', '?')})")
        print(f"{'─' * 60}")

        entry = {
            "image": img_name,
            "store": gt.get("store", "Unknown"),
            "features": None,
            "easyocr_accuracy": 0.0,
            "easyocr_time": 0.0,
            "paddle_accuracy": 0.0,
            "paddle_time": 0.0,
            "ensemble_accuracy": 0.0,
            "ensemble_time": 0.0,
            "best_strategy": "ensemble",
            "recommendation": None,
        }

        # Extract features
        try:
            feats = extract_image_features(str(img_path))
            entry["features"] = {
                "resolution_bucket": feats.resolution_bucket,
                "height": feats.height,
                "width": feats.width,
                "contrast_stddev": round(feats.contrast_stddev, 1),
                "skew_angle": round(feats.skew_angle, 2),
                "laplacian_variance": round(feats.laplacian_variance, 1),
                "text_density": round(feats.text_density, 4),
                "is_thermal": feats.is_thermal,
                "estimated_dpi": round(feats.estimated_dpi, 0),
            }
        except Exception as e:
            print(f"    Feature extraction failed: {e}")

        # Run EasyOCR
        print(f"    EasyOCR ... ", end="", flush=True)
        t0 = time.time()
        try:
            tokens = easy.extract(img_path)
            entry["easyocr_time"] = time.time() - t0
            if tokens:
                result = parse_receipt(tokens)
                row = score_result(img_name, gt, result)
                entry["easyocr_accuracy"] = _accuracy(row)
            print(f"{entry['easyocr_accuracy']:.0%}  ({entry['easyocr_time']:.1f}s)")
        except Exception as e:
            entry["easyocr_time"] = time.time() - t0
            print(f"error: {e}")

        # Run PaddleOCR
        if has_paddle:
            print(f"    PaddleOCR ... ", end="", flush=True)
            t0 = time.time()
            try:
                tokens = paddle.extract(img_path)
                entry["paddle_time"] = time.time() - t0
                if tokens:
                    result = parse_receipt(tokens)
                    row = score_result(img_name, gt, result)
                    entry["paddle_accuracy"] = _accuracy(row)
                print(f"{entry['paddle_accuracy']:.0%}  ({entry['paddle_time']:.1f}s)")
            except Exception as e:
                entry["paddle_time"] = time.time() - t0
                print(f"error: {e}")

        # Run Ensemble
        if ensemble:
            print(f"    Ensemble ... ", end="", flush=True)
            t0 = time.time()
            try:
                tokens = ensemble.extract(img_path)
                entry["ensemble_time"] = time.time() - t0
                if tokens:
                    result = parse_receipt(tokens)
                    row = score_result(img_name, gt, result)
                    entry["ensemble_accuracy"] = _accuracy(row)
                print(f"{entry['ensemble_accuracy']:.0%}  ({entry['ensemble_time']:.1f}s)")
            except Exception as e:
                entry["ensemble_time"] = time.time() - t0
                print(f"error: {e}")

        # Determine best strategy
        accs = {
            "easyocr_only": entry["easyocr_accuracy"],
            "paddleocr_only": entry["paddle_accuracy"],
            "ensemble": entry["ensemble_accuracy"],
        }
        entry["best_strategy"] = max(accs, key=accs.get)

        # What would the recommender pick?
        if entry["features"]:
            try:
                feats_obj = extract_image_features(str(img_path))
                rec = recommend_strategy(feats_obj, store_hint=gt.get("store"))
                entry["recommendation"] = rec.strategy.value
            except Exception:
                pass

        results[img_name] = entry

    return results


def build_store_preference(results: dict) -> dict[str, str]:
    """Determine per-store best engine from calibration results."""
    store_wins = defaultdict(lambda: {"easyocr": 0, "paddle": 0})

    for entry in results.values():
        store = entry["store"]
        if entry["easyocr_accuracy"] > entry["paddle_accuracy"]:
            store_wins[store]["easyocr"] += 1
        elif entry["paddle_accuracy"] > entry["easyocr_accuracy"]:
            store_wins[store]["paddle"] += 1
        else:
            # Tie — prefer faster engine
            if entry["easyocr_time"] < entry["paddle_time"]:
                store_wins[store]["easyocr"] += 1
            else:
                store_wins[store]["paddle"] += 1

    pref = {}
    for store, wins in sorted(store_wins.items()):
        best = "easyocr" if wins["easyocr"] >= wins["paddle"] else "paddle"
        pref[store] = best

    return pref


def print_summary(results: dict) -> None:
    """Print a formatted summary table."""
    print(f"\n{'═' * 72}")
    print("  CALIBRATION SUMMARY")
    print(f"{'═' * 72}")

    # Per-image table
    print(f"\n  {'Image':<10} {'Store':<15} {'EasyOCR':>8} {'Paddle':>8} "
          f"{'Ensemble':>9} {'Best':>12} {'Recomm':>12}")
    print(f"  {'─' * 10} {'─' * 15} {'─' * 8} {'─' * 8} {'─' * 9} {'─' * 12} {'─' * 12}")

    for img_name in sorted(results.keys()):
        e = results[img_name]
        print(f"  {img_name:<10} {e['store']:<15} "
              f"{e['easyocr_accuracy']:>7.0%} {e['paddle_accuracy']:>7.0%} "
              f"{e['ensemble_accuracy']:>8.0%} {e['best_strategy']:>12} "
              f"{(e.get('recommendation') or '?'):>12}")

    # Per-store preference
    store_pref = build_store_preference(results)
    print(f"\n  STORE_ENGINE_PREFERENCE = {{")
    for store, engine in sorted(store_pref.items()):
        print(f"      {store!r}: {engine!r},")
    print(f"  }}")

    # Overall stats
    n = len(results)
    if n == 0:
        return

    avg_easy = sum(e["easyocr_accuracy"] for e in results.values()) / n
    avg_paddle = sum(e["paddle_accuracy"] for e in results.values()) / n
    avg_ens = sum(e["ensemble_accuracy"] for e in results.values()) / n

    # Simulated recommender accuracy: use recommended engine's accuracy
    rec_correct = 0
    rec_single = 0
    for e in results.values():
        rec = e.get("recommendation", "ensemble")
        if rec == "easyocr_only":
            rec_acc = e["easyocr_accuracy"]
            rec_single += 1
        elif rec == "paddleocr_only":
            rec_acc = e["paddle_accuracy"]
            rec_single += 1
        else:
            rec_acc = e["ensemble_accuracy"]
        # Count as correct if within 5% of ensemble
        if rec_acc >= e["ensemble_accuracy"] - 0.05:
            rec_correct += 1

    print(f"\n  Overall average accuracy:")
    print(f"    EasyOCR:   {avg_easy:.1%}")
    print(f"    PaddleOCR: {avg_paddle:.1%}")
    print(f"    Ensemble:  {avg_ens:.1%}")
    print(f"\n  Recommender simulation:")
    print(f"    Matches/beats ensemble: {rec_correct}/{n}")
    print(f"    Single-engine picks:    {rec_single}/{n}")

    # Latency savings
    total_ens_time = sum(e["ensemble_time"] for e in results.values())
    total_rec_time = 0.0
    for e in results.values():
        rec = e.get("recommendation", "ensemble")
        if rec == "easyocr_only":
            total_rec_time += e["easyocr_time"]
        elif rec == "paddleocr_only":
            total_rec_time += e["paddle_time"]
        else:
            total_rec_time += e["ensemble_time"]

    if total_ens_time > 0:
        saved_pct = (1.0 - total_rec_time / total_ens_time) * 100
        print(f"\n  Estimated latency:")
        print(f"    Ensemble total:     {total_ens_time:.1f}s")
        print(f"    Recommender total:  {total_rec_time:.1f}s")
        print(f"    Savings:            {saved_pct:.1f}%")

    print(f"{'═' * 72}")


def main():
    parser = argparse.ArgumentParser(description="Calibrate OCR model recommender")
    parser.add_argument(
        "--images", nargs="*", default=None,
        help="Specific image filenames (e.g. 1.jpg 5.jpg). Default: all ground truth.",
    )
    parser.add_argument(
        "--output", default=None,
        help="Output JSON path. Default: calibration_results.json in test dir.",
    )
    args = parser.parse_args()

    results = run_calibration(images=args.images)

    if not results:
        return

    # Save JSON
    output_path = args.output or str(_TEST_DIR / "calibration_results.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to {output_path}")

    print_summary(results)


if __name__ == "__main__":
    main()
