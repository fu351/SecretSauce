"""
coru_vocab.py
=============
Extract English-only item names from CORU's IE/ CSVs and dump them as a
grocery vocabulary. Drop-in extension for receipt_dictionary.GROCERY_TERMS.

CORU's IE subset is an item catalog (not per-receipt GT) with ~10k rows,
~80% Arabic. We filter to English rows, tokenize, dedupe, and write:

    coru/grocery_vocab.txt        one uppercase token per line, sorted
    coru/grocery_vocab_meta.json  per-class counts + sample items

Usage:
    pip install huggingface_hub
    python coru_vocab.py
    python coru_vocab.py --exclude-classes "Cleaning & Laundry,Personal Care"
    python coru_vocab.py --min-token-len 4
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
OUT_DIR = THIS_DIR / "coru"
RAW_DIR = OUT_DIR / "raw"
VOCAB_PATH = OUT_DIR / "grocery_vocab.txt"
META_PATH = OUT_DIR / "grocery_vocab_meta.json"

DATASET_ID = "abdoelsayed/CORU"
IE_FILES = ["IE/train.csv", "IE/val.csv", "IE/test.csv"]

# Arabic Unicode block (U+0600–U+06FF). If any char in this block appears
# in Item_Name, treat the row as non-English.
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")

# Tokenize on non-letters; keep alphabetic runs only.
TOKEN_RE = re.compile(r"[A-Za-z]+")

# Units / size words / packaging that aren't grocery vocabulary.
STOP_TOKENS = {
    "G", "GR", "GM", "GMS", "KG", "MG", "ML", "L", "LT", "LTR", "LITRE", "LITER",
    "OZ", "LB", "LBS", "FL", "CT", "PCS", "PC", "PK", "PKG", "PCK", "EA", "EACH",
    "BX", "BOX", "PACK", "CAN", "JAR", "BTL", "BOTTLE", "BAG", "TUB", "TIN",
    "CM", "MM", "IN", "INCH",
    "AND", "FOR", "WITH", "FROM", "THE", "OF",
}


def hf_download(rel_path: str) -> Path | None:
    from huggingface_hub import hf_hub_download
    from huggingface_hub.utils import EntryNotFoundError
    try:
        return Path(hf_hub_download(
            repo_id=DATASET_ID,
            filename=rel_path,
            repo_type="dataset",
            cache_dir=str(RAW_DIR / ".cache"),
        ))
    except (EntryNotFoundError, FileNotFoundError):
        return None


def is_english_row(item_name: str) -> bool:
    if not item_name:
        return False
    if ARABIC_RE.search(item_name):
        return False
    # Require at least one alphabetic character to avoid pure-numeric rows.
    return bool(TOKEN_RE.search(item_name))


def tokenize(text: str, min_len: int) -> list[str]:
    out = []
    for m in TOKEN_RE.findall(text or ""):
        tok = m.upper()
        if len(tok) < min_len or tok in STOP_TOKENS:
            continue
        out.append(tok)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exclude-classes", default="",
                    help="Comma-separated CORU class values to exclude.")
    ap.add_argument("--min-token-len", type=int, default=3,
                    help="Drop tokens shorter than this many chars (default: 3).")
    args = ap.parse_args()

    excluded = {s.strip() for s in args.exclude_classes.split(",") if s.strip()}

    print(f"Downloading IE CSVs from {DATASET_ID}…")
    csv_paths = []
    for rel in IE_FILES:
        p = hf_download(rel)
        if p is not None:
            csv_paths.append(p)
            print(f"  fetched {rel}")
    if not csv_paths:
        raise SystemExit("No IE CSVs available.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token_counts: Counter[str] = Counter()
    class_counts: Counter[str] = Counter()
    class_samples: dict[str, list[str]] = defaultdict(list)
    n_rows = n_english = n_excluded = 0

    for path in csv_paths:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                n_rows += 1
                name = (row.get("Item_Name") or "").strip()
                if not is_english_row(name):
                    continue
                cls = (row.get("class") or "").strip()
                if cls in excluded:
                    n_excluded += 1
                    continue
                n_english += 1
                class_counts[cls] += 1
                if len(class_samples[cls]) < 3:
                    class_samples[cls].append(name)

                # Tokens from item name + brand.
                brand = (row.get("Brand") or "").strip()
                for tok in tokenize(name, args.min_token_len):
                    token_counts[tok] += 1
                if brand and not ARABIC_RE.search(brand):
                    for tok in tokenize(brand, args.min_token_len):
                        token_counts[tok] += 1

    sorted_tokens = sorted(token_counts.keys())
    VOCAB_PATH.write_text("\n".join(sorted_tokens) + "\n")

    meta = {
        "source": DATASET_ID,
        "rows_total": n_rows,
        "rows_english": n_english,
        "rows_excluded_by_class": n_excluded,
        "unique_tokens": len(sorted_tokens),
        "excluded_classes": sorted(excluded),
        "min_token_len": args.min_token_len,
        "classes": [
            {
                "name": cls,
                "count": count,
                "samples": class_samples.get(cls, []),
            }
            for cls, count in class_counts.most_common()
        ],
        "top_tokens": token_counts.most_common(50),
    }
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    print(f"\nRows scanned:        {n_rows}")
    print(f"English rows kept:   {n_english}")
    if excluded:
        print(f"Excluded by class:   {n_excluded}")
    print(f"Unique tokens:       {len(sorted_tokens)}")
    print(f"Wrote {VOCAB_PATH}")
    print(f"Wrote {META_PATH}")
    print(f"\nTop classes:")
    for c, n in class_counts.most_common(10):
        print(f"  {n:5d}  {c}")


if __name__ == "__main__":
    main()
