"""
ocr_bench.py
============
Modular OCR accuracy benchmark with pluggable engines.

Runs the full OCR -> parser pipeline on sample receipts and compares against
hand-verified ground truth.  Each OCR engine is a self-contained class that
implements `extract(img_path) -> list[str]`.

Supported engines:
    easyocr     EasyOCR (default, always available)
    paddle      PaddleOCR (requires: pip install paddlepaddle paddleocr)

Usage:
    # Compare all available engines
    python ocr_bench.py

    # Run a specific engine
    python ocr_bench.py --engine paddle
    python ocr_bench.py --engine easyocr

    # Run on specific images only
    python ocr_bench.py --images 1.jpg 5.jpg 16.jpg

    # Skip preprocessing (use raw images)
    python ocr_bench.py --no-preprocess

    # Use the heuristic model recommender
    python ocr_bench.py --recommend
"""
from __future__ import annotations

import abc
import argparse
import importlib.util
import re
import sys
import tempfile
import time
from pathlib import Path

import cv2
from PIL import Image

# ── Load receipt_parser ──────────────────────────────────────────────────────
_PARSER_PATH = Path(__file__).resolve().parent.parent / "receipt_parser.py"
_spec = importlib.util.spec_from_file_location("receipt_parser", _PARSER_PATH)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
parse_receipt = _mod.parse_receipt
spatial_reorder = _mod.spatial_reorder
ensemble_merge = _mod.ensemble_merge

SAMPLES_DIR = Path(__file__).resolve().parent / "samples"
DATASETS_DIR = Path(__file__).resolve().parent / "datasets"


def load_external_dataset(name: str) -> tuple[Path, dict[str, dict]]:
    """Load images dir + ground_truth.json for an external dataset (coru, wildreceipt)."""
    import json as _json
    root = DATASETS_DIR / name
    gt_path = root / "ground_truth.json"
    img_dir = root / "images"
    if not gt_path.exists():
        raise SystemExit(
            f"{gt_path} not found — run datasets/{name}_filter.py first."
        )
    return img_dir, _json.loads(gt_path.read_text())

# ── Load advanced preprocessing (optional) ─────────────────────────────────
_PREPROC_PATH = Path(__file__).resolve().parent.parent / "preprocessing.py"
try:
    _pp_spec = importlib.util.spec_from_file_location("preprocessing", _PREPROC_PATH)
    _pp_mod = importlib.util.module_from_spec(_pp_spec)
    _pp_spec.loader.exec_module(_pp_mod)
    crop_receipt_roi = _pp_mod.crop_receipt_roi
    perspective_correct = _pp_mod.perspective_correct
    _HAS_ADVANCED_PREPROC = True
except Exception:
    _HAS_ADVANCED_PREPROC = False

# ── Load recommender (optional) ────────────────────────────────────────────
_RECOMMENDER_PATH = Path(__file__).resolve().parent.parent / "model_recommender.py"
_FEATURES_PATH = Path(__file__).resolve().parent.parent / "image_features.py"
_RECOMMENDER_LOAD_ERROR: str | None = None
try:
    import sys as _sys

    _f_spec = importlib.util.spec_from_file_location("image_features", _FEATURES_PATH)
    _f_mod = importlib.util.module_from_spec(_f_spec)
    _sys.modules["image_features"] = _f_mod
    _f_spec.loader.exec_module(_f_mod)
    extract_image_features = _f_mod.extract_image_features

    _r_spec = importlib.util.spec_from_file_location("model_recommender", _RECOMMENDER_PATH)
    _r_mod = importlib.util.module_from_spec(_r_spec)
    _sys.modules["model_recommender"] = _r_mod
    _r_spec.loader.exec_module(_r_mod)
    recommend_strategy = _r_mod.recommend_strategy
    should_escalate = _r_mod.should_escalate
    Strategy = _r_mod.Strategy
    _HAS_RECOMMENDER = True
except Exception as _e:
    import traceback as _tb
    _RECOMMENDER_LOAD_ERROR = "".join(_tb.format_exception(type(_e), _e, _e.__traceback__))
    _HAS_RECOMMENDER = False

# ── Ground truth ─────────────────────────────────────────────────────────────

GROUND_TRUTH: dict[str, dict] = {
    "1.jpg": {
        "store": "Trader Joe's",
        "subtotal": 38.68,
        "total": 38.68,
        "date": "2014-06-28",
        "min_items": 15,
        "item_prices": [
            ("CARROTS", 1.29),
            ("CUCUMBER", 1.99),
            ("OATMEAL", 2.49),
            ("AVOCADO", 5.99),
            ("PEANUT", 2.49),
            ("BANANA", 0.87),
        ],
    },
    "2.jpg": {
        "store": "Walmart",
        "subtotal": 46.44,
        "total": 49.90,
        "date": "2020-10-18",
        "min_items": 4,
        "item_prices": [
            ("OATMEAL", 1.76),
            ("TUM", 6.74),
            ("ATHLETIC", 24.97),
            ("DEXAS", 12.97),
        ],
    },
    "5.jpg": {
        "store": "Whole Foods",
        "subtotal": 28.28,
        "total": 28.28,
        "date": "2021-02-10",
        "min_items": 3,
        "item_prices": [
            ("SEA SALT", 1.29),
            ("BRIOCHE", 6.99),
            ("CHEF PLATE", 20.00),
        ],
    },
    "10.jpg": {
        "store": "SPAR",
        "min_items": 4,
        "item_prices": [
            ("WORCESTER", 17.99),
            ("MILKY", 16.99),
            ("VIENNA", 33.99),
            ("PEACH", 82.99),
        ],
    },
    "11.jpg": {
        "store": "Whole Foods",
        "total": 45.44,
        "min_items": 8,
        "item_prices": [
            ("TORTILLA", 6.99),
            ("BLACK BEAN", 1.29),
            ("MANGO", 2.99),
            ("STRAWBERR", 2.99),
            ("COTTAGE", 3.49),
        ],
    },
    "16.jpg": {
        "store": "Walmart",
        "subtotal": 21.74,
        "total": 23.19,
        "date": "2017-11-13",
        "min_items": 3,
        "item_prices": [
            ("WING", 3.98),
            ("ASST", 4.88),
            ("CUTIE", 12.88),
        ],
    },
    "19.jpg": {
        "store": "Walmart",
        "total": 35.05,
        "date": "2021-10-16",
        "min_items": 4,
        "item_prices": [
            ("GRILL", 14.97),
            ("FIBER", 12.54),
            ("CELERY", 2.48),
        ],
    },
    "3.jpg": {
        "store": "Walmart",
        "subtotal": 139.44,
        "date": "2019-04-27",
        "min_items": 18,
        "item_prices": [
            ("RITZ", 2.78),
            ("BAGEL", 4.56),
        ],
    },
}


# ── Engines & preprocessing (lifted to lib/receipt-ocr/engines.py) ──────────
# Historical context: these classes used to live in this file. They were
# moved out so the FastAPI service (and any future caller) can import them
# without going through the bench harness. We re-export them here so the
# rest of this file — and any external script that imports symbols from
# ocr_bench — continues to work unchanged.
_ENGINES_PATH = Path(__file__).resolve().parent.parent / "engines.py"
_eng_spec = importlib.util.spec_from_file_location("engines", _ENGINES_PATH)
_eng_mod = importlib.util.module_from_spec(_eng_spec)
_eng_spec.loader.exec_module(_eng_mod)

OCREngine = _eng_mod.OCREngine
EasyOCREngine = _eng_mod.EasyOCREngine
PaddleOCREngine = _eng_mod.PaddleOCREngine
EnsembleEngine = _eng_mod.EnsembleEngine
preprocess = _eng_mod.preprocess
preprocess_base = _eng_mod.preprocess_base
preprocess_finalize = _eng_mod.preprocess_finalize
_deskew = _eng_mod._deskew
_unsharp_mask = _eng_mod._unsharp_mask
_SHARPEN_LAP_MIN = _eng_mod._SHARPEN_LAP_MIN
_SHARPEN_LAP_MAX = _eng_mod._SHARPEN_LAP_MAX
ENGINES = _eng_mod.ENGINES
get_available_engines = _eng_mod.get_available_engines


# ── Scoring ──────────────────────────────────────────────────────────────────


def _price_close(a, b, tol=0.05) -> bool:
    if a is None or b is None:
        return False
    return abs(a - b) <= tol


def score_result(name: str, gt: dict, result: dict) -> dict:
    row: dict = {"image": name, "checks": {}, "pass": 0, "total": 0}

    def check(label, passed: bool, detail: str = ""):
        row["total"] += 1
        if passed:
            row["pass"] += 1
        row["checks"][label] = ("✓" if passed else "✗") + (f"  {detail}" if detail else "")

    if "store" in gt:
        check("store",
              result.get("store") == gt["store"],
              f"got={result.get('store')!r}  expected={gt['store']!r}")

    if "total" in gt:
        check("total",
              _price_close(result.get("total"), gt["total"]),
              f"got={result.get('total')}  expected={gt['total']}")

    if "subtotal" in gt:
        check("subtotal",
              _price_close(result.get("subtotal"), gt["subtotal"]),
              f"got={result.get('subtotal')}  expected={gt['subtotal']}")

    if "date" in gt:
        check("date",
              result.get("date") == gt["date"],
              f"got={result.get('date')!r}  expected={gt['date']!r}")

    if "min_items" in gt:
        n = len(result.get("items", []))
        check("min_items",
              n >= gt["min_items"],
              f"got={n}  expected≥{gt['min_items']}")

    def _normalize(s: str) -> str:
        return "".join(s.upper().split())

    for substr, expected_price in gt.get("item_prices", []):
        items = result.get("items", [])
        target = _normalize(substr)
        matched = next(
            (it for it in items if target in _normalize(it.get("name", ""))),
            None,
        )
        if matched:
            check(f"item:{substr}",
                  _price_close(matched["price"], expected_price),
                  f"name={matched['name']!r}  got={matched['price']}  expected={expected_price}")
        else:
            check(f"item:{substr}",
                  False,
                  f"item not found in output  expected price={expected_price}")

    return row


# ── Benchmark Runner ─────────────────────────────────────────────────────────


def run_benchmark(
    engine: OCREngine,
    images: list[str] | None = None,
    do_preprocess: bool = True,
    samples_dir: Path | None = None,
    ground_truth: dict[str, dict] | None = None,
) -> dict:
    """Run benchmark for a single engine. Returns summary dict."""

    samples_dir = samples_dir or SAMPLES_DIR
    ground_truth = ground_truth if ground_truth is not None else GROUND_TRUTH

    targets = {k: v for k, v in ground_truth.items()
               if images is None or k in images}

    all_pass = all_total = 0
    total_time = 0.0
    rows = []

    for img_name, gt in targets.items():
        img_path = samples_dir / img_name
        if not img_path.exists():
            print(f"  [SKIP] {img_name} not found")
            continue

        print(f"  {img_name} … ", end="", flush=True)
        t0 = time.time()
        try:
            tokens = engine.extract(img_path, do_preprocess=do_preprocess)
        except Exception as e:
            print(f"error: {e}")
            continue
        elapsed = time.time() - t0
        total_time += elapsed

        if not tokens:
            print(f"no tokens ({elapsed:.1f}s)")
            continue

        result = parse_receipt(tokens)
        row = score_result(img_name, gt, result)
        # Attach ground_truth so downstream consumers (CI gate, JSON export,
        # LR calibrator) can group rows by store without re-loading GROUND_TRUTH.
        row["ground_truth"] = gt
        row["elapsed"] = elapsed
        rows.append(row)

        all_pass += row["pass"]
        all_total += row["total"]
        pct = 100 * row["pass"] / row["total"] if row["total"] else 0
        n_items = len(result.get("items", []))
        print(f"{row['pass']}/{row['total']} ({pct:.0f}%)  "
              f"items={n_items}  {elapsed:.1f}s")

    return {
        "engine": engine.name,
        "rows": rows,
        "passed": all_pass,
        "total": all_total,
        "accuracy": all_pass / all_total * 100 if all_total else 0,
        "time": total_time,
    }


def print_report(results: list[dict]) -> None:
    """Print comparison table across engines."""

    sep = "═" * 72

    # Per-engine detailed report
    for res in results:
        print(f"\n{sep}")
        print(f"  ENGINE: {res['engine'].upper()}")
        print(f"  Accuracy: {res['passed']}/{res['total']}  "
              f"({res['accuracy']:.1f}%)  Time: {res['time']:.1f}s")
        print(sep)

        for row in res["rows"]:
            pct = 100 * row["pass"] / row["total"] if row["total"] else 0
            print(f"\n  {'▸'} {row['image']}  ({row['pass']}/{row['total']}  {pct:.0f}%)")
            for label, verdict in row["checks"].items():
                print(f"      {label:<22} {verdict}")

    # Comparison summary
    if len(results) > 1:
        print(f"\n{'━' * 72}")
        print("  COMPARISON SUMMARY")
        print(f"{'━' * 72}")
        print(f"  {'Engine':<12} {'Passed':>8} {'Total':>8} {'Accuracy':>10} {'Time':>8}")
        print(f"  {'─' * 12} {'─' * 8} {'─' * 8} {'─' * 10} {'─' * 8}")
        for res in sorted(results, key=lambda r: -r["accuracy"]):
            print(f"  {res['engine']:<12} {res['passed']:>8} {res['total']:>8} "
                  f"{res['accuracy']:>9.1f}% {res['time']:>7.1f}s")

        # Per-image comparison
        print(f"\n  Per-image breakdown:")
        all_images = sorted(set(
            row["image"] for res in results for row in res["rows"]
        ))
        header = f"  {'Image':<10}" + "".join(f" {r['engine']:>10}" for r in results)
        print(header)
        print(f"  {'─' * 10}" + "".join(f" {'─' * 10}" for _ in results))
        for img in all_images:
            parts = [f"  {img:<10}"]
            for res in results:
                row = next((r for r in res["rows"] if r["image"] == img), None)
                if row:
                    pct = 100 * row["pass"] / row["total"] if row["total"] else 0
                    parts.append(f" {row['pass']}/{row['total']} ({pct:2.0f}%)")
                else:
                    parts.append(f" {'—':>10}")
            print("".join(f"{p:>12}" for p in parts))

        print(f"{'━' * 72}")


def print_diagnostic(results: list[dict]) -> None:
    """Aggregate per-check-type pass rate across all rows in each result."""
    from collections import defaultdict

    order = ["store", "total", "subtotal", "date", "min_items", "item"]
    for res in results:
        agg: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for row in res["rows"]:
            for label, verdict in row["checks"].items():
                key = label.split(":", 1)[0]  # collapse "item:CARROTS" → "item"
                agg[key][1] += 1
                if verdict.startswith("✓"):
                    agg[key][0] += 1
        if not agg:
            continue
        print(f"\n  DIAGNOSTIC: {res['engine'].upper()}")
        print(f"  {'─' * 50}")
        keys = order + [k for k in agg if k not in order]
        for key in keys:
            if key not in agg:
                continue
            passed, total = agg[key]
            pct = 100 * passed / total if total else 0
            n_blocks = round(pct / 5)
            bar = "█" * n_blocks + "░" * (20 - n_blocks)
            print(f"  {key:<12} {bar}  {pct:5.1f}%  ({passed}/{total})")


# ── Recommended benchmark ───────────────────────────────────────────────────


def run_recommended_benchmark(
    images: list[str] | None = None,
    do_preprocess: bool = True,
    samples_dir: Path | None = None,
    ground_truth: dict[str, dict] | None = None,
) -> dict:
    """Run benchmark using the heuristic recommender to pick the strategy.

    For each image:
      1. Extract image features
      2. Call recommend_strategy()
      3. Run only the recommended engine(s)
      4. If single-engine result triggers should_escalate(), fall back to ensemble
      5. Log the decision and whether escalation happened
    """
    if not _HAS_RECOMMENDER:
        print("ERROR: Recommender modules not available.")
        if _RECOMMENDER_LOAD_ERROR:
            print(f"       {_RECOMMENDER_LOAD_ERROR}")
        return {"engine": "recommend", "rows": [], "passed": 0, "total": 0,
                "accuracy": 0, "time": 0}

    samples_dir = samples_dir or SAMPLES_DIR
    ground_truth = ground_truth if ground_truth is not None else GROUND_TRUTH

    targets = {k: v for k, v in ground_truth.items()
               if images is None or k in images}

    # Load all engines (needed for any strategy)
    print("  Loading engines for recommender mode ...")
    easy = EasyOCREngine()
    easy.load()
    try:
        paddle = PaddleOCREngine()
        paddle.load()
        has_paddle = True
    except Exception:
        has_paddle = False
    ens = EnsembleEngine()
    ens.load()

    all_pass = all_total = 0
    total_time = 0.0
    total_ensemble_time = 0.0
    rows = []
    decisions = []

    for img_name, gt in targets.items():
        img_path = samples_dir / img_name
        if not img_path.exists():
            print(f"  [SKIP] {img_name} not found")
            continue

        print(f"  {img_name} … ", end="", flush=True)

        # Step 1: Extract features + recommend
        t0 = time.time()
        features = extract_image_features(str(img_path))
        rec = recommend_strategy(features, store_hint=gt.get("store"))
        strategy = rec.strategy

        # Step 2: Run recommended engine
        escalated = False
        if strategy == Strategy.EASYOCR_ONLY:
            tokens = easy.extract(img_path, do_preprocess=do_preprocess)
            result = parse_receipt(tokens) if tokens else {}
            if should_escalate(result):
                escalated = True
                tokens = ens.extract(img_path, do_preprocess=do_preprocess)
                result = parse_receipt(tokens) if tokens else {}
        elif strategy == Strategy.PADDLEOCR_ONLY and has_paddle:
            tokens = paddle.extract(img_path, do_preprocess=do_preprocess)
            result = parse_receipt(tokens) if tokens else {}
            if should_escalate(result):
                escalated = True
                tokens = ens.extract(img_path, do_preprocess=do_preprocess)
                result = parse_receipt(tokens) if tokens else {}
        else:
            tokens = ens.extract(img_path, do_preprocess=do_preprocess)
            result = parse_receipt(tokens) if tokens else {}

        elapsed = time.time() - t0
        total_time += elapsed

        # Time ensemble alone for comparison
        t_ens = time.time()
        ens.extract(img_path, do_preprocess=do_preprocess)
        ens_elapsed = time.time() - t_ens
        total_ensemble_time += ens_elapsed

        if not tokens:
            print(f"no tokens ({elapsed:.1f}s)")
            continue

        row = score_result(img_name, gt, result)
        row["ground_truth"] = gt
        row["elapsed"] = elapsed
        rows.append(row)
        all_pass += row["pass"]
        all_total += row["total"]
        pct = 100 * row["pass"] / row["total"] if row["total"] else 0

        decision = {
            "image": img_name,
            "strategy": strategy.value,
            "escalated": escalated,
            "time": round(elapsed, 1),
            "ensemble_time": round(ens_elapsed, 1),
        }
        decisions.append(decision)

        esc_tag = " [ESCALATED]" if escalated else ""
        print(f"{row['pass']}/{row['total']} ({pct:.0f}%)  "
              f"strategy={strategy.value}{esc_tag}  "
              f"{elapsed:.1f}s (ens: {ens_elapsed:.1f}s)")

    # Print timing comparison
    if total_ensemble_time > 0:
        savings_pct = (1.0 - total_time / total_ensemble_time) * 100
        print(f"\n  Timing: recommend={total_time:.1f}s  "
              f"ensemble={total_ensemble_time:.1f}s  "
              f"savings={savings_pct:.1f}%")

    n_single = sum(1 for d in decisions
                   if d["strategy"] in ("easyocr_only", "paddleocr_only")
                   and not d["escalated"])
    n_escalated = sum(1 for d in decisions if d["escalated"])
    print(f"  Decisions: {len(decisions)} images, {n_single} single-engine, "
          f"{n_escalated} escalated")

    return {
        "engine": "recommend",
        "rows": rows,
        "passed": all_pass,
        "total": all_total,
        "accuracy": all_pass / all_total * 100 if all_total else 0,
        "time": total_time,
        "decisions": decisions,
    }


# ── CLI ──────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Modular OCR accuracy benchmark")
    parser.add_argument(
        "--engine", nargs="*", default=None,
        help="OCR engine(s) to test. Options: easyocr, paddle. "
             "Default: all available engines.",
    )
    parser.add_argument(
        "--images", nargs="*", default=None,
        help="Specific image filenames to test (e.g. 1.jpg 5.jpg)",
    )
    parser.add_argument(
        "--no-preprocess", action="store_true",
        help="Skip image preprocessing (use raw images)",
    )
    parser.add_argument(
        "--recommend", action="store_true",
        help="Use the heuristic model recommender instead of a fixed engine",
    )
    parser.add_argument(
        "--dataset", choices=["samples", "wildreceipt"], default="samples",
        help="Which dataset to bench against (default: samples).",
    )
    parser.add_argument(
        "--include-unknown-stores", action="store_true",
        help="Include receipts whose store the parser doesn't canonicalize "
             "(external datasets only; default: drop them).",
    )
    parser.add_argument(
        "--diagnose", action="store_true",
        help="Print per-check-type pass-rate breakdown after the bench run.",
    )
    parser.add_argument(
        "--sample", type=int, default=0, metavar="N",
        help="Run on a random sample of N receipts (deterministic seed for "
             "reproducibility across runs). 0 = use all.",
    )
    parser.add_argument(
        "--sample-seed", type=int, default=0,
        help="Seed for --sample. Change to draw a different sample.",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Emit results as JSON to stdout instead of (alongside the) human "
             "summary. Used by CI to read accuracy figures programmatically.",
    )
    parser.add_argument(
        "--gate", type=str, default=None, metavar="PATH",
        help="Path to a CI gate config (JSON). When set, the bench exits with "
             "code 1 if accuracy falls below the thresholds defined in that "
             "file. See ci_gate.example.json for the schema.",
    )
    args = parser.parse_args()

    if args.dataset == "samples":
        samples_dir, ground_truth = SAMPLES_DIR, GROUND_TRUTH
    else:
        samples_dir, ground_truth = load_external_dataset(args.dataset)
        if not args.include_unknown_stores:
            n_before = len(ground_truth)
            ground_truth = {k: v for k, v in ground_truth.items() if "store" in v}
            print(f"Dataset: {args.dataset}  "
                  f"({len(ground_truth)}/{n_before} receipts with canonical store)\n")
        else:
            print(f"Dataset: {args.dataset} ({len(ground_truth)} receipts)\n")

    if args.sample > 0 and args.sample < len(ground_truth):
        import random as _random
        rng = _random.Random(args.sample_seed)
        keys = sorted(ground_truth.keys())  # sort for stable seeding
        chosen = rng.sample(keys, args.sample)
        ground_truth = {k: ground_truth[k] for k in chosen}
        print(f"Sampled {args.sample} receipts (seed={args.sample_seed})\n")

    if args.recommend:
        print("Running with heuristic recommender\n")
        rec_res = run_recommended_benchmark(
            images=args.images,
            do_preprocess=not args.no_preprocess,
            samples_dir=samples_dir,
            ground_truth=ground_truth,
        )
        # Also run ensemble for comparison
        print(f"\n{'─' * 72}")
        print("Running ensemble baseline for comparison …\n")
        ens = EnsembleEngine()
        ens.load()
        ens_res = run_benchmark(
            ens,
            images=args.images,
            do_preprocess=not args.no_preprocess,
            samples_dir=samples_dir,
            ground_truth=ground_truth,
        )
        print_report([rec_res, ens_res])
        if args.diagnose:
            print_diagnostic([rec_res, ens_res])
        if args.json:
            _emit_json([rec_res, ens_res])
        if args.gate:
            sys.exit(_check_gate(args.gate, [rec_res, ens_res]))
        return

    available = get_available_engines()
    if not available:
        print("No OCR engines available. Install easyocr or paddleocr.")
        return

    engines_to_run = args.engine or available
    engines_to_run = [e for e in engines_to_run if e in available]

    if not engines_to_run:
        print(f"Requested engine(s) not available. Installed: {available}")
        return

    print(f"Available engines: {available}")
    print(f"Running: {engines_to_run}")
    if args.images:
        print(f"Images: {args.images}")
    print()

    results = []
    for eng_name in engines_to_run:
        print(f"{'─' * 72}")
        print(f"Loading {eng_name} …")
        engine = ENGINES[eng_name]()
        engine.load()
        print(f"{eng_name} ready.\n")

        res = run_benchmark(
            engine,
            images=args.images,
            do_preprocess=not args.no_preprocess,
            samples_dir=samples_dir,
            ground_truth=ground_truth,
        )
        results.append(res)

    print_report(results)
    if args.diagnose:
        print_diagnostic(results)
    if args.json:
        _emit_json(results)
    if args.gate:
        sys.exit(_check_gate(args.gate, results))


# ── CI helpers (JSON output + gate evaluation) ───────────────────────────────


def _emit_json(results: list[dict]) -> None:
    """Print a machine-readable summary of one or more bench runs to stdout.

    Schema (one object per engine):
        {
          "engine": "easyocr",
          "n_images": 8,
          "passed": 24,
          "total": 30,
          "accuracy": 0.80,
          "per_image": [{"image": "1.jpg", "passed": 4, "total": 5, ...}, ...],
          "per_store": {"Walmart": {"passed": 9, "total": 10, "accuracy": 0.90}, ...}
        }
    """
    import json as _json
    payload = []
    for res in results:
        engine_summary = {
            "engine": res.get("engine"),
            "n_images": len(res.get("rows") or []),
            "passed": sum(r["pass"] for r in res.get("rows") or []),
            "total": sum(r["total"] for r in res.get("rows") or []),
        }
        engine_summary["accuracy"] = (
            engine_summary["passed"] / engine_summary["total"]
            if engine_summary["total"] else 0.0
        )

        # Per-store rollup (uses ground-truth store from the score row)
        per_store: dict[str, dict[str, int]] = {}
        for r in res.get("rows") or []:
            gt = (r.get("ground_truth") or {})
            store = gt.get("store") or "Unknown"
            slot = per_store.setdefault(store, {"passed": 0, "total": 0})
            slot["passed"] += r["pass"]
            slot["total"] += r["total"]
        for store, slot in per_store.items():
            slot["accuracy"] = slot["passed"] / slot["total"] if slot["total"] else 0.0
        engine_summary["per_store"] = per_store
        engine_summary["per_image"] = res.get("rows") or []
        payload.append(engine_summary)

    print(_json.dumps(payload, indent=2, default=str))


def _check_gate(gate_path: str, results: list[dict]) -> int:
    """Evaluate the gate config and return the exit code (0=pass, 1=fail).

    Gate config schema (JSON):
        {
          "min_overall_accuracy": 0.80,
          "min_per_store_accuracy": {
            "Walmart": 0.85,
            "Whole Foods": 0.80,
            "Trader Joe's": 0.80
          },
          "engine": "ensemble"   // which result to gate on; defaults to last
        }

    All checks must pass for exit code 0. Failures are written to stderr.
    """
    import json as _json
    try:
        cfg = _json.loads(Path(gate_path).read_text())
    except Exception as e:
        print(f"Could not load gate config {gate_path}: {e}", file=sys.stderr)
        return 1

    target_engine = cfg.get("engine")
    chosen = None
    if target_engine:
        for r in results:
            if r.get("engine") == target_engine:
                chosen = r
                break
        if chosen is None:
            print(f"Gate engine {target_engine!r} not in results", file=sys.stderr)
            return 1
    else:
        chosen = results[-1]

    failures: list[str] = []
    rows = chosen.get("rows") or []
    overall_passed = sum(r["pass"] for r in rows)
    overall_total = sum(r["total"] for r in rows)
    overall_acc = overall_passed / overall_total if overall_total else 0.0

    min_overall = cfg.get("min_overall_accuracy")
    if min_overall is not None and overall_acc < min_overall:
        failures.append(
            f"Overall accuracy {overall_acc:.3f} < gate {min_overall:.3f}"
        )

    per_store_thresholds = cfg.get("min_per_store_accuracy") or {}
    if per_store_thresholds:
        per_store: dict[str, dict[str, int]] = {}
        for r in rows:
            gt = r.get("ground_truth") or {}
            store = gt.get("store") or "Unknown"
            slot = per_store.setdefault(store, {"passed": 0, "total": 0})
            slot["passed"] += r["pass"]
            slot["total"] += r["total"]
        for store, threshold in per_store_thresholds.items():
            slot = per_store.get(store)
            if slot is None:
                failures.append(f"Store {store!r} has no rows in result set")
                continue
            acc = slot["passed"] / slot["total"] if slot["total"] else 0.0
            if acc < threshold:
                failures.append(
                    f"Store {store!r} accuracy {acc:.3f} < gate {threshold:.3f} "
                    f"({slot['passed']}/{slot['total']})"
                )

    if failures:
        print("\nCI gate FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  ✗ {f}", file=sys.stderr)
        return 1

    print("\nCI gate PASSED.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    main()
