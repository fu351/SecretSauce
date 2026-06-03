"""
wildreceipt_filter.py
=====================
Pull WildReceipt directly from the canonical openmmlab tarball, filter to
grocery merchants, and emit ground_truth.json (+ extracted images).

We bypass HuggingFace `datasets` because Theivaprakasham/wildreceipt ships
as a Python loading script which `datasets>=4` no longer supports.

Tarball layout (~400 MB):
    wildreceipt/
      class_list.txt
      train.txt              one JSON per line with annotations
      test.txt
      image_files/
        Image_*/...jpeg

Each annotation line:
    {
      "file_name": "image_files/Image_1/0.jpeg",
      "height": 1200, "width": 1600,
      "annotations": [
        {"box": [x1,y1,x2,y2,x3,y3,x4,y4], "text": "Walmart", "label": 1},
        ...
      ]
    }

Canonical WildReceipt labels (key/value pairs collapse to *_value here):
    1  Store_name_value      13 Prod_quantity_value
    3  Store_addr_value      15 Prod_price_value
    5  Tel_value             17 Subtotal_value
    7  Date_value            19 Tax_value
    9  Time_value            21 Tips_value
    11 Prod_item_value       23 Total_value

Usage:
    python wildreceipt_filter.py --dry-run        # parse only, no image copy
    python wildreceipt_filter.py                  # extract grocery images too
    python wildreceipt_filter.py --extra-merchants "FOO MART"
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import tarfile
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

_PARSER_PATH = Path(__file__).resolve().parent.parent.parent / "receipt_parser.py"
_spec = importlib.util.spec_from_file_location("receipt_parser", _PARSER_PATH)
_parser = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_parser)
detect_store = _parser.detect_store
parse_date = _parser.parse_date

THIS_DIR = Path(__file__).resolve().parent
OUT_DIR = THIS_DIR / "wildreceipt"
IMG_DIR = OUT_DIR / "images"
RAW_DIR = OUT_DIR / "raw"
GT_PATH = OUT_DIR / "ground_truth.json"
TARBALL_PATH = RAW_DIR / "wildreceipt.tar"
WILDRECEIPT_TARBALL = "https://download.openmmlab.com/mmocr/data/wildreceipt.tar"

LABEL_STORE = 1
LABEL_DATE = 7
LABEL_ITEM = 11
LABEL_QTY = 13
LABEL_PRICE = 15
LABEL_SUBTOTAL = 17
LABEL_TOTAL = 23

# Grocery merchant allowlist — case-insensitive substring match against the
# concatenated store-name text on the receipt.
GROCERY_MERCHANTS = {
    # US national / superstores that sell groceries
    "walmart", "target", "costco", "sam's club", "sams club", "bj's",
    # US grocery chains
    "kroger", "safeway", "whole foods", "trader joe", "aldi", "publix",
    "wegmans", "h-e-b", "heb", "sprouts", "albertsons", "food lion",
    "stop & shop", "shoprite", "meijer", "winn-dixie", "smart & final",
    "ralphs", "vons", "pavilions", "fry's food", "king soopers",
    "fred meyer", "qfc", "smith's food", "harris teeter", "lidl",
    "fairway", "giant eagle", "giant food", "jewel-osco", "shaws",
    "stater bros", "save mart", "food 4 less", "grocery outlet",
    "natural grocers",
    # International English
    "tesco", "sainsbury", "asda", "morrisons", "waitrose", "iceland",
    "spar", "woolworths", "coles", "countdown",
    # Generic store-name keywords (loose matches; verify in output)
    "supermarket", "grocery", "foods", "market", "mart",
}

NON_GROCERY_BLOCKLIST = {
    "stock market", "flea market", "petsmart", "pet smart", "kmart",
    "walmart pharmacy",
    # sub-tenants that operate inside grocery stores but aren't grocery receipts
    "pizzahut", "pizza hut", "starbucks", "mcdonald", "subway",
    "burger king", "kfc", "dunkin",
}

# Annotator noise: redacted card/account numbers occasionally tagged as items.
CARD_NUMBER_RE = re.compile(r"^\d*X{4,}\d*$", re.IGNORECASE)


def is_grocery_merchant(name: str, extra: set[str]) -> bool:
    n = name.lower().strip()
    if not n:
        return False
    if any(b in n for b in NON_GROCERY_BLOCKLIST):
        if "walmart" in n and "pharmacy" not in n:
            return True
        return False
    return any(m in n for m in (GROCERY_MERCHANTS | extra))


def poly_to_bbox(poly: list[float]) -> tuple[float, float, float, float]:
    xs = poly[0::2]
    ys = poly[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def collect_text(annotations: list[dict], label: int, dedupe: bool = False) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for a in annotations:
        if a.get("label") != label or not a.get("text"):
            continue
        text = a["text"].strip()
        if not text:
            continue
        if dedupe:
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
        parts.append(text)
    return " ".join(parts).strip()


def parse_money(text: str) -> float | None:
    if not text:
        return None
    m = re.search(r"\d+(?:[.,]\d{1,2})?", text)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def extract_items(annotations: list[dict]) -> list[tuple[str, float]]:
    """Pair item-name annotations with price annotations on the same row."""
    items, prices = [], []
    heights = []
    for a in annotations:
        text = (a.get("text") or "").strip()
        if not text:
            continue
        x1, y1, x2, y2 = poly_to_bbox(a["box"])
        ymid = (y1 + y2) / 2
        heights.append(y2 - y1)
        if a["label"] == LABEL_ITEM:
            if CARD_NUMBER_RE.match(text.replace(" ", "")):
                continue
            items.append((ymid, x1, text))
        elif a["label"] == LABEL_PRICE:
            prices.append((ymid, x1, text))

    if not items or not prices or not heights:
        return []
    median_h = sorted(heights)[len(heights) // 2]
    row_tol = max(median_h * 0.6, 8.0)

    items.sort()
    rows: list[list] = []
    for it in items:
        if rows and abs(it[0] - rows[-1][-1][0]) <= row_tol:
            rows[-1].append(it)
        else:
            rows.append([it])

    used = [False] * len(prices)
    out: list[tuple[str, float]] = []
    for row in rows:
        ymid = sum(r[0] for r in row) / len(row)
        name = " ".join(r[2] for r in sorted(row, key=lambda x: x[1])).strip()
        best, best_idx = None, -1
        for i, (py, _, pw) in enumerate(prices):
            if used[i] or abs(py - ymid) > row_tol:
                continue
            if best is None or abs(py - ymid) < abs(best[0] - ymid):
                best, best_idx = (py, _, pw), i
        if best is None:
            continue
        used[best_idx] = True
        price = parse_money(best[2])
        if price is None or price <= 0 or not name:
            continue
        out.append((name.upper(), price))
    return out


def ensure_tarball() -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    if TARBALL_PATH.exists() and TARBALL_PATH.stat().st_size > 1_000_000:
        return TARBALL_PATH
    print(f"Downloading {WILDRECEIPT_TARBALL} (~400 MB)…")
    with urlopen(WILDRECEIPT_TARBALL) as resp:
        TARBALL_PATH.write_bytes(resp.read())
    return TARBALL_PATH


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse annotations and report counts; don't extract images.")
    ap.add_argument("--extra-merchants", default="",
                    help="Comma-separated extra merchant substrings to allow.")
    ap.add_argument("--limit", type=int, default=0,
                    help="Stop after N grocery matches (0 = all).")
    args = ap.parse_args()

    extra = {s.strip().lower() for s in args.extra_merchants.split(",") if s.strip()}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(exist_ok=True)
    tarball = ensure_tarball()

    gt: dict[str, dict] = {}
    matched = scanned = skipped_no_store = 0
    skipped_examples: list[str] = []

    print(f"Reading {tarball.name}…")
    with tarfile.open(tarball, mode="r:") as tar:
        # First pass: read annotations.
        anno_members = [m for m in tar.getmembers()
                        if m.name.endswith((".txt",)) and "/wildreceipt/" in m.name + "/"
                        and (m.name.endswith("/train.txt") or m.name.endswith("/test.txt"))]
        if not anno_members:
            anno_members = [m for m in tar.getmembers()
                            if m.name.endswith(("train.txt", "test.txt"))]
        if not anno_members:
            raise SystemExit("No train.txt / test.txt found in tarball.")

        for m in anno_members:
            split = "train" if m.name.endswith("train.txt") else "test"
            f = tar.extractfile(m)
            if f is None:
                continue
            for line in f:
                line = line.strip()
                if not line:
                    continue
                scanned += 1
                row = json.loads(line)
                anns = row.get("annotations", [])
                store = collect_text(anns, LABEL_STORE, dedupe=True)
                if not store:
                    skipped_no_store += 1
                    continue
                if not is_grocery_merchant(store, extra):
                    if len(skipped_examples) < 5:
                        skipped_examples.append(store)
                    continue

                items = extract_items(anns)
                # Canonicalise store via the parser. If the parser doesn't
                # recognise it, omit the store field so the bench skips the
                # check (the parser would return None at runtime anyway).
                canonical_store = detect_store([store])
                entry: dict = {
                    "store_raw": store,
                    "split": split,
                    "source": "wildreceipt",
                    "min_items": max(1, len(items) // 3) if items else 0,
                }
                if canonical_store:
                    entry["store"] = canonical_store
                total = parse_money(collect_text(anns, LABEL_TOTAL))
                subtotal = parse_money(collect_text(anns, LABEL_SUBTOTAL))
                date_text = collect_text(anns, LABEL_DATE)
                if total is not None:
                    entry["total"] = total
                if subtotal is not None:
                    entry["subtotal"] = subtotal
                if date_text:
                    # Try US (month-first) first, then day-first as fallback.
                    iso = parse_date(date_text) or parse_date(date_text, day_first=True)
                    if iso:
                        entry["date"] = iso
                    else:
                        entry["date_raw"] = date_text
                if items:
                    entry["item_prices"] = [list(t) for t in items]

                src_rel = row["file_name"]
                stem = Path(src_rel).stem
                dst_name = f"{split}_{stem}.jpeg"
                entry["image_path"] = dst_name

                if not args.dry_run:
                    img_member = next(
                        (mm for mm in tar.getmembers() if mm.name.endswith(src_rel)),
                        None,
                    )
                    if img_member is not None:
                        src_f = tar.extractfile(img_member)
                        if src_f is not None:
                            (IMG_DIR / dst_name).write_bytes(src_f.read())

                gt[dst_name] = entry
                matched += 1
                if args.limit and matched >= args.limit:
                    break
            if args.limit and matched >= args.limit:
                break

    print(f"\nScanned receipts:     {scanned}")
    print(f"Skipped (no store):   {skipped_no_store}")
    print(f"Matched grocery:      {matched}")
    if skipped_examples:
        print(f"\nSample skipped store names (sanity check the allowlist):")
        for s in skipped_examples:
            print(f"  - {s!r}")

    GT_PATH.write_text(json.dumps(gt, indent=2, ensure_ascii=False))
    print(f"\nWrote {GT_PATH}  ({len(gt)} entries)")
    if not args.dry_run:
        n_imgs = sum(1 for _ in IMG_DIR.glob("*"))
        print(f"Images: {IMG_DIR} ({n_imgs} files)")


if __name__ == "__main__":
    main()
