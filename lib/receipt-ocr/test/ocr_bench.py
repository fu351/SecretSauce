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
"""
from __future__ import annotations

import abc
import argparse
import importlib.util
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


# ── Preprocessing ────────────────────────────────────────────────────────────


def preprocess(img_path: Path, target_height: int = 1500,
               max_height: int = 2000) -> str:
    """Upscale + adaptive-threshold for noisy receipt images.

    Returns path to a temporary preprocessed PNG.
    Falls back to the original path on error.
    """
    try:
        img = cv2.imread(str(img_path))
        if img is None:
            raise ValueError(f"cv2.imread returned None for {img_path}")
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Upscale small images
        if gray.shape[0] < target_height:
            scale = target_height / gray.shape[0]
            gray = cv2.resize(gray, None, fx=scale, fy=scale,
                              interpolation=cv2.INTER_CUBIC)
        # Downscale very large images to avoid OOM / hangs
        if gray.shape[0] > max_height:
            scale = max_height / gray.shape[0]
            gray = cv2.resize(gray, None, fx=scale, fy=scale,
                              interpolation=cv2.INTER_AREA)
        gray = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 10,
        )
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        cv2.imwrite(tmp.name, gray)
        return tmp.name
    except Exception:
        return str(img_path)


# ── OCR Engine Interface ─────────────────────────────────────────────────────


class OCREngine(abc.ABC):
    """Abstract base for pluggable OCR engines."""

    name: str = "base"

    @abc.abstractmethod
    def load(self) -> None:
        """Load model weights (called once)."""

    @abc.abstractmethod
    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        """Return flat token list from an image."""

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} ({self.name})>"


# ── EasyOCR Engine ───────────────────────────────────────────────────────────


class EasyOCREngine(OCREngine):
    name = "easyocr"

    def __init__(self):
        self._reader = None

    def load(self) -> None:
        import easyocr
        self._reader = easyocr.Reader(["en"], gpu=True, verbose=False)

    def extract_detections(
        self, img_path: Path, do_preprocess: bool = True,
    ) -> list[tuple]:
        """Return raw (bbox, text, conf) detections before spatial reorder."""
        proc = preprocess(img_path) if do_preprocess else str(img_path)
        try:
            return self._reader.readtext(proc, detail=1)
        except Exception:
            try:
                img = Image.open(proc).convert("RGB")
                padded = Image.new("RGB", (img.width + 4, img.height + 4), (255, 255, 255))
                padded.paste(img, (2, 2))
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
                    padded.save(t.name)
                    return self._reader.readtext(t.name, detail=1)
            except Exception as e:
                print(f"  ⚠  EasyOCR failed: {e}")
                return []

    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        return spatial_reorder(self.extract_detections(img_path, do_preprocess))


# ── PaddleOCR Engine ─────────────────────────────────────────────────────────


class PaddleOCREngine(OCREngine):
    name = "paddle"

    def __init__(self):
        self._ocr = None

    def load(self) -> None:
        import logging
        import os
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        for name in ("ppocr", "paddle", "paddleocr", "paddlex"):
            logging.getLogger(name).setLevel(logging.ERROR)

        from paddleocr import PaddleOCR
        self._ocr = PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )

    def _results_to_detections(self, results) -> list[tuple]:
        """Convert PaddleOCR predict() output to (bbox, text, conf) tuples."""
        if not results:
            return []
        detections = []
        for page in results:
            polys = page.get("dt_polys", [])
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            for i, text in enumerate(texts):
                if not text or not text.strip():
                    continue
                bbox = polys[i].tolist() if i < len(polys) else [[0, 0]] * 4
                conf = scores[i] if i < len(scores) else 0.0
                detections.append((bbox, text, conf))
        return detections

    def extract_detections(
        self, img_path: Path, do_preprocess: bool = True,
    ) -> list[tuple]:
        """Return raw (bbox, text, conf) detections before spatial reorder."""
        proc = preprocess(img_path) if do_preprocess else str(img_path)
        try:
            results = list(self._ocr.predict(proc))
            return self._results_to_detections(results)
        except Exception:
            try:
                results = list(self._ocr.predict(str(img_path)))
                return self._results_to_detections(results)
            except Exception as e:
                print(f"  ⚠  PaddleOCR failed: {e}")
                return []

    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        return spatial_reorder(self.extract_detections(img_path, do_preprocess))


# ── Ensemble Engine ──────────────────────────────────────────────────────────


class EnsembleEngine(OCREngine):
    """Merges detections from EasyOCR and PaddleOCR at the bounding-box level."""

    name = "ensemble"

    def __init__(self):
        self._easy = EasyOCREngine()
        self._paddle = PaddleOCREngine()

    def load(self) -> None:
        self._easy.load()
        self._paddle.load()

    def extract_detections(
        self, img_path: Path, do_preprocess: bool = True,
    ) -> list[tuple]:
        """Run both engines in parallel, merge detections."""
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=2) as pool:
            fut_easy = pool.submit(
                self._easy.extract_detections, img_path, do_preprocess,
            )
            fut_paddle = pool.submit(
                self._paddle.extract_detections, img_path, do_preprocess,
            )
            dets_easy = fut_easy.result()
            dets_paddle = fut_paddle.result()

        return ensemble_merge(dets_easy, dets_paddle)

    def extract(self, img_path: Path, do_preprocess: bool = True) -> list[str]:
        # force_band_order=True: ensemble-merged detections have arbitrary
        # order from the merge/dedup pass, so Y-band grouping with x-sort
        # is essential for correct name→price pairing.
        # y_tolerance=15: tighter than default (25) because ensemble has
        # more detections per visual line, making adjacent lines more
        # likely to bleed into each other with a loose tolerance.
        return spatial_reorder(
            self.extract_detections(img_path, do_preprocess),
            y_tolerance=15,
            force_band_order=True,
        )


# ── Engine Registry ──────────────────────────────────────────────────────────

ENGINES: dict[str, type[OCREngine]] = {
    "easyocr": EasyOCREngine,
    "paddle": PaddleOCREngine,
    "ensemble": EnsembleEngine,
}


def get_available_engines() -> list[str]:
    """Return names of engines whose dependencies are installed."""
    available = []
    # EasyOCR
    try:
        import easyocr  # noqa: F401
        available.append("easyocr")
    except ImportError:
        pass
    # PaddleOCR
    try:
        import paddleocr  # noqa: F401
        available.append("paddle")
    except ImportError:
        pass
    # Ensemble is available when both engines are installed
    if "easyocr" in available and "paddle" in available:
        available.append("ensemble")
    return available


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

    for substr, expected_price in gt.get("item_prices", []):
        items = result.get("items", [])
        matched = next(
            (it for it in items if substr.upper() in it.get("name", "").upper()),
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
) -> dict:
    """Run benchmark for a single engine. Returns summary dict."""

    targets = {k: v for k, v in GROUND_TRUTH.items()
               if images is None or k in images}

    all_pass = all_total = 0
    total_time = 0.0
    rows = []

    for img_name, gt in targets.items():
        img_path = SAMPLES_DIR / img_name
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
    args = parser.parse_args()

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
        )
        results.append(res)

    print_report(results)


if __name__ == "__main__":
    main()
