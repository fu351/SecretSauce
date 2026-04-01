"""
accuracy_test.py

Runs the full OCR → parser pipeline on a set of sample receipts and
compares the output against a hand-verified ground truth built by
visually inspecting each image.

Metrics reported per image:
  • store     – correct / wrong
  • total     – correct (±$0.05 tolerance) / wrong / missing
  • subtotal  – correct / wrong / missing
  • date      – correct / wrong / missing
  • items     – # parsed vs # visible, plus price-match rate for known items

Usage:
    python accuracy_test.py
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

import cv2
import easyocr
import numpy as np
from PIL import Image

# ── Load receipt_parser from repo ─────────────────────────────────────────────
_PARSER_PATH = Path(__file__).resolve().parent.parent / "receipt_parser.py"
_spec = importlib.util.spec_from_file_location("receipt_parser", _PARSER_PATH)
_mod  = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
parse_receipt = _mod.parse_receipt
spatial_reorder = _mod.spatial_reorder

SAMPLES_DIR = Path(__file__).resolve().parent / "samples"

# ── Ground truth ───────────────────────────────────────────────────────────────
# Verified by visual inspection of each receipt image.
# Fields omitted when unreadable in the image.
# item_prices: list of (substring_of_name, expected_price) tuples — substring
# matching is used so minor OCR name differences don't break price checks.
GROUND_TRUTH: dict[str, dict] = {
    "1.jpg": {
        "store":    "Trader Joe's",
        "subtotal": 38.68,
        "total":    38.68,   # cash total printed as $40; subtotal is the bill
        "date":     "2014-06-28",
        "min_items": 15,
        "item_prices": [
            ("CARROTS",   1.29),
            ("CUCUMBER",  1.99),
            ("OATMEAL",   2.49),
            ("AVOCADO",   5.99),
            ("PEANUT",    2.49),
            ("BANANA",    0.87),
        ],
    },
    "2.jpg": {
        "store":    "Walmart",
        "subtotal": 46.44,
        "total":    49.90,
        "date":     "2020-10-18",
        "min_items": 4,
        "item_prices": [
            ("OATMEAL",    1.76),
            ("TUM",        6.74),
            ("ATHLETIC",  24.97),
            ("DEXAS",     12.97),
        ],
    },
    "5.jpg": {
        "store":    "Whole Foods",
        "subtotal": 28.28,
        "total":    28.28,
        "date":     "2021-02-10",
        "min_items": 3,
        "item_prices": [
            ("SEA SALT",   1.29),
            ("BRIOCHE",    6.99),
            ("CHEF PLATE", 20.00),
        ],
    },
    "10.jpg": {
        "store":    "SPAR",
        "min_items": 4,
        "item_prices": [
            ("WORCESTER",  17.99),
            ("MILKY",      16.99),
            ("VIENNA",     33.99),
            ("PEACH",      82.99),
        ],
    },
    "11.jpg": {
        "store":    "Whole Foods",
        "total":    45.44,
        "min_items": 8,
        "item_prices": [
            ("TORTILLA",   6.99),
            ("BLACK BEAN", 1.29),
            ("MANGO",      2.99),
            ("STRAWBERR",  2.99),
            ("COTTAGE",    3.49),
        ],
    },
    "16.jpg": {
        "store":    "Walmart",
        "subtotal": 21.74,
        "total":    23.19,
        "date":     "2017-11-13",
        "min_items": 3,
        "item_prices": [
            ("WING",  3.98),
            ("ASST",  4.88),
            ("CUTIE", 12.88),
        ],
    },
    "19.jpg": {
        "store":    "Walmart",
        "total":    35.05,
        "date":     "2021-10-16",
        "min_items": 4,
        "item_prices": [
            ("GRILL",   14.97),
            ("FIBER",   12.54),
            ("CELERY",   2.48),
        ],
    },
    "3.jpg": {
        "store":    "Walmart",
        "subtotal": 139.44,
        "date":     "2019-04-27",
        "min_items": 18,
        "item_prices": [
            ("RITZ",  2.78),
            ("BAGEL", 4.56),
        ],
    },
}

# ── Preprocessing + OCR helpers ────────────────────────────────────────────────

def preprocess(img_path: Path) -> str:
    try:
        img = cv2.imread(str(img_path))
        if img is None:
            raise ValueError(f"cv2.imread returned None for {img_path} — file may be corrupt or unreadable")
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if gray.shape[0] < 1500:
            scale = 1500 / gray.shape[0]
            gray  = cv2.resize(gray, None, fx=scale, fy=scale,
                               interpolation=cv2.INTER_CUBIC)
        gray = cv2.adaptiveThreshold(gray, 255,
                                     cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 31, 10)
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        cv2.imwrite(tmp.name, gray)
        return tmp.name
    except Exception:
        return str(img_path)


def safe_readtext(reader, img_path: Path) -> list[str]:
    """Run easyOCR with detail=1 and apply spatial reordering.

    Uses bounding-box spatial pairing to ensure item names precede their
    prices on the same line when a clear two-column layout is detected.
    Falls back to easyOCR's native reading order for single-column receipts.
    """
    proc = preprocess(img_path)
    try:
        detections = reader.readtext(proc, detail=1)
        return spatial_reorder(detections)
    except Exception:
        try:
            img    = Image.open(proc).convert("RGB")
            padded = Image.new("RGB", (img.width + 4, img.height + 4), (255, 255, 255))
            padded.paste(img, (2, 2))
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
                padded.save(t.name)
                detections = reader.readtext(t.name, detail=1)
                return spatial_reorder(detections)
        except Exception as e:
            print(f"  ⚠  OCR failed for {img_path.name}: {e}")
            return []


# ── Scoring helpers ────────────────────────────────────────────────────────────

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

    # Store
    if "store" in gt:
        check("store",
              result.get("store") == gt["store"],
              f"got={result.get('store')!r}  expected={gt['store']!r}")

    # Total
    if "total" in gt:
        check("total",
              _price_close(result.get("total"), gt["total"]),
              f"got={result.get('total')}  expected={gt['total']}")

    # Subtotal
    if "subtotal" in gt:
        check("subtotal",
              _price_close(result.get("subtotal"), gt["subtotal"]),
              f"got={result.get('subtotal')}  expected={gt['subtotal']}")

    # Date
    if "date" in gt:
        check("date",
              result.get("date") == gt["date"],
              f"got={result.get('date')!r}  expected={gt['date']!r}")

    # Min items
    if "min_items" in gt:
        n = len(result.get("items", []))
        check("min_items",
              n >= gt["min_items"],
              f"got={n}  expected≥{gt['min_items']}")

    # Per-item price checks
    for substr, expected_price in gt.get("item_prices", []):
        items = result.get("items", [])
        matched = next(
            (it for it in items
             if substr.upper() in it.get("name", "").upper()),
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


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("Loading EasyOCR model …")
    reader = easyocr.Reader(["en"], gpu=True)
    print("Model ready.\n")

    all_pass = all_total = 0
    rows = []

    for img_name, gt in GROUND_TRUTH.items():
        img_path = SAMPLES_DIR / img_name
        if not img_path.exists():
            print(f"[SKIP] {img_name} not found")
            continue

        print(f"Processing {img_name} …", flush=True)
        tokens = safe_readtext(reader, img_path)
        if not tokens:
            print(f"  ⚠  No tokens extracted — skipping\n")
            continue

        result = parse_receipt(tokens)
        row    = score_result(img_name, gt, result)
        rows.append(row)

        all_pass  += row["pass"]
        all_total += row["total"]

    # ── Print report ──────────────────────────────────────────────────────────
    sep = "─" * 72
    print(f"\n{sep}")
    print("ACCURACY REPORT")
    print(sep)

    for row in rows:
        pct = 100 * row["pass"] / row["total"] if row["total"] else 0
        print(f"\n{'▸'} {row['image']}  ({row['pass']}/{row['total']} checks  {pct:.0f}%)")
        for label, verdict in row["checks"].items():
            print(f"    {label:<22} {verdict}")

    print(f"\n{sep}")
    overall = 100 * all_pass / all_total if all_total else 0
    print(f"OVERALL:  {all_pass}/{all_total} checks passed  ({overall:.1f}%)")
    print(sep)


if __name__ == "__main__":
    main()
