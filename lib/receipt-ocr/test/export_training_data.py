#!/usr/bin/env python3
"""
export_training_data.py
=======================
Pull verified rows from `receipt_training_examples`, download their images,
re-run OCR to get fresh per-token bounding boxes, and align the structured
verified parse to per-token BIO labels for the classifier trainer.

The output format mirrors WildReceipt's published manifest (one record per
receipt, JSON line) so the eventual training script can reuse the same
data-loading code.

Why re-OCR instead of caching tokens at capture time
----------------------------------------------------
At scan time we don't store the per-token bounding boxes — only the
parsed result. Re-OCR'ing at export time means the training tokens come
from the same engine that runs in production, and a future engine swap
(e.g. switching to a newer easyocr) regenerates training data with
matching token shapes. ~2-3s per receipt; runs offline so latency
doesn't matter.

Alignment heuristic (structured parse -> token labels)
-------------------------------------------------------
For each OCR detection (bbox, text, conf), we assign one of:
    O, B-STORE, I-STORE, B-DATE, B-ITEM, I-ITEM,
    B-PRICE, B-SUBTOTAL, B-TOTAL, B-TAX

Rules, in priority order:
  1. Token text appears in `verified_parse.store` substring  → STORE
  2. Token text matches `verified_parse.date` (any common format) → DATE
  3. Token's parsed-as-float price matches subtotal/total/tax  → SUBTOTAL/TOTAL/TAX
  4. Token's parsed-as-float price matches a verified item's price → PRICE
  5. Token text appears as a word in a verified item's name   → ITEM
  6. Otherwise                                               → O

For multi-word items, the leftmost token in a Y-band gets B-ITEM and
subsequent tokens in that band get I-ITEM. Same for STORE.

Usage
-----
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python lib/receipt-ocr/test/export_training_data.py \\
            --out training_data.jsonl

    # Mark exported rows so subsequent runs are incremental:
    python lib/receipt-ocr/test/export_training_data.py --mark-exported

    # Cap rows fetched (testing):
    python lib/receipt-ocr/test/export_training_data.py --limit 20
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

# ── Module loaders (mirrors ocr_bench.py pattern) ─────────────────────────

_TEST_DIR = Path(__file__).resolve().parent
_LIB_DIR = _TEST_DIR.parent

def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod

# Don't import engines.py at module load — only when actually exporting.
_engines_mod = None
_parser_mod = _load("receipt_parser", _LIB_DIR / "receipt_parser.py")


def _ensure_engine():
    global _engines_mod
    if _engines_mod is None:
        _engines_mod = _load("engines", _LIB_DIR / "engines.py")
    return _engines_mod


# ── Label scheme (must match the trainer's label2id mapping) ──────────────

LABELS = [
    "O",
    "B-STORE", "I-STORE",
    "B-DATE",
    "B-ITEM", "I-ITEM",
    "B-PRICE",
    "B-SUBTOTAL",
    "B-TAX",
    "B-TOTAL",
]
LABEL_TO_ID = {l: i for i, l in enumerate(LABELS)}


# ── Supabase fetch ────────────────────────────────────────────────────────

TRAINING_BUCKET = "receipt-training-images"


def _supabase_client():
    try:
        from supabase import create_client
    except ImportError as e:
        sys.exit(f"supabase SDK missing: {e}\n  pip install supabase==2.3.4")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


def fetch_verified(client, limit: int | None) -> list[dict]:
    """Pull verified-and-not-yet-exported rows."""
    q = (
        client.table("receipt_training_examples")
        .select(
            "id, image_storage_path, verified_parse, candidate_parse, "
            "verified_by, verified_at, disposition"
        )
        .not_.is_("verified_at", "null")
        .is_("exported_at", "null")
        .is_("deleted_at", "null")
        .neq("disposition", "rejected")
        .order("verified_at", desc=False)
    )
    if limit is not None:
        q = q.limit(limit)
    return (q.execute().data or [])


def download_image(client, path: str, dest: Path) -> bool:
    try:
        bytes_ = client.storage.from_(TRAINING_BUCKET).download(path)
    except Exception as e:
        print(f"  download failed for {path}: {e}", file=sys.stderr)
        return False
    if not bytes_:
        return False
    dest.write_bytes(bytes_)
    return True


# ── Token labeling ────────────────────────────────────────────────────────

_PRICE_RE = re.compile(r"\d{1,4}[.,]\d{2}")


def _norm_text(t: str) -> str:
    return t.upper().strip()


def _norm_price(text: str) -> float | None:
    m = _PRICE_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def _date_variants(iso: str | None) -> set[str]:
    """All printed forms of an ISO date the OCR might capture."""
    if not iso:
        return set()
    try:
        y, m, d = iso.split("-")
    except ValueError:
        return set()
    y2 = y[-2:]
    out = {iso, f"{m}/{d}/{y}", f"{m}/{d}/{y2}", f"{m}-{d}-{y}", f"{m}-{d}-{y2}",
           f"{d}/{m}/{y}", f"{d}/{m}/{y2}", f"{d}-{m}-{y}", f"{d}-{m}-{y2}"}
    months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
    try:
        mn = months[int(m) - 1]
        out.add(f"{mn} {int(d)} {y}")
        out.add(f"{mn} {int(d)}, {y}")
    except (ValueError, IndexError):
        pass
    return {v.upper() for v in out}


def label_tokens(detections: list[tuple], parse: dict) -> list[str]:
    """Assign a BIO label to each detection given the verified parse.

    Returns a list of label strings parallel to `detections`.
    """
    labels = ["O"] * len(detections)
    if not detections:
        return labels

    # Pre-compute the targets we'll search for.
    store_words = {w for w in _norm_text(parse.get("store") or "").split() if len(w) >= 3}
    date_targets = _date_variants(parse.get("date"))
    subtotal = parse.get("subtotal")
    total = parse.get("total")
    taxes = [t.get("amount") for t in (parse.get("taxes") or []) if t.get("amount") is not None]
    items = parse.get("items") or []
    item_prices = [it.get("price") for it in items if it.get("price") is not None]
    item_word_sets = [
        {w for w in _norm_text(it.get("name") or "").split() if len(w) >= 3}
        for it in items
    ]

    # Group detections into Y-bands so we can apply BIO correctly within a row.
    def _y_mid(bbox):
        ys = [p[1] for p in bbox]
        return (min(ys) + max(ys)) / 2

    indexed = list(enumerate(detections))
    indexed.sort(key=lambda kv: _y_mid(kv[1][0]))

    bands: list[list[int]] = []
    cur: list[int] = []
    cur_y = None
    for orig_idx, det in indexed:
        y = _y_mid(det[0])
        if cur_y is None or abs(y - cur_y) <= 20:
            cur.append(orig_idx)
            cur_y = y if cur_y is None else (cur_y + y) / 2
        else:
            bands.append(cur)
            cur = [orig_idx]
            cur_y = y
    if cur:
        bands.append(cur)

    # Helper: tag a contiguous run of token indices with B-X then I-X.
    def _tag_span(idxs: list[int], tag: str) -> None:
        if not idxs:
            return
        labels[idxs[0]] = f"B-{tag}"
        if f"I-{tag}" in LABEL_TO_ID:
            for i in idxs[1:]:
                labels[i] = f"I-{tag}"
        else:
            # Single-token-only labels (PRICE, SUBTOTAL, TOTAL, DATE, TAX) — leave others O
            for i in idxs[1:]:
                if labels[i] == "O":
                    labels[i] = f"B-{tag}"

    # Walk bands left-to-right and assign labels.
    for band_idxs in bands:
        # Sort within band by x_min to match reading order.
        band_idxs.sort(key=lambda i: min(p[0] for p in detections[i][0]))

        # ── Pass 1: numeric matches (subtotal/total/tax/item-price) ────
        # These are the strongest signal — exact float match beats text matches.
        for i in band_idxs:
            text = detections[i][1]
            price = _norm_price(text)
            if price is None:
                continue
            if total is not None and abs(price - total) <= 0.01:
                labels[i] = "B-TOTAL"
            elif subtotal is not None and abs(price - subtotal) <= 0.01:
                labels[i] = "B-SUBTOTAL"
            elif any(abs(price - t) <= 0.01 for t in taxes):
                labels[i] = "B-TAX"
            elif any(abs(price - p) <= 0.01 for p in item_prices):
                labels[i] = "B-PRICE"

        # ── Pass 2: date in this band ──────────────────────────────────
        if date_targets:
            for i in band_idxs:
                if labels[i] != "O":
                    continue
                up = _norm_text(detections[i][1])
                if any(d in up for d in date_targets):
                    labels[i] = "B-DATE"
                    break

        # ── Pass 3: store name span ────────────────────────────────────
        if store_words:
            store_run: list[int] = []
            for i in band_idxs:
                if labels[i] != "O":
                    continue
                up = _norm_text(detections[i][1])
                if any(w in up for w in store_words):
                    store_run.append(i)
                else:
                    if store_run:
                        _tag_span(store_run, "STORE")
                        store_run = []
                        break  # first store match per band is enough
            if store_run:
                _tag_span(store_run, "STORE")

        # ── Pass 4: item-name spans ────────────────────────────────────
        # For each band, find which item (if any) the band's text tokens
        # belong to. If multiple words from one item appear, label the
        # contiguous run as ITEM.
        for word_set in item_word_sets:
            if not word_set:
                continue
            item_run: list[int] = []
            for i in band_idxs:
                if labels[i] != "O":
                    continue
                up = _norm_text(detections[i][1])
                if any(w in up for w in word_set):
                    item_run.append(i)
                elif item_run:
                    _tag_span(item_run, "ITEM")
                    item_run = []
            if item_run:
                _tag_span(item_run, "ITEM")

    return labels


# ── Output writer (JSONL, one record per receipt) ─────────────────────────


def serialize_record(row: dict, detections: list[tuple], labels: list[str]) -> dict:
    """Build the exported JSON record for one receipt."""
    bboxes = []
    texts = []
    confs = []
    for det in detections:
        bbox, text, conf = det
        # Normalize bbox to a flat 4-corner list of [x, y] floats
        bboxes.append([[float(p[0]), float(p[1])] for p in bbox])
        texts.append(text)
        confs.append(float(conf))
    return {
        "id": row["id"],
        "verified_by": row.get("verified_by"),
        "verified_at": row.get("verified_at"),
        "verified_parse": row.get("verified_parse") or row.get("candidate_parse"),
        "tokens": [
            {"text": t, "bbox": b, "conf": c, "label": lab}
            for t, b, c, lab in zip(texts, bboxes, confs, labels)
        ],
    }


# ── Main ──────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", type=Path, default=Path("training_data.jsonl"))
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--engine", default="ensemble",
                    choices=["easyocr", "paddle", "ensemble"],
                    help="Engine used to re-OCR images at export time")
    ap.add_argument("--mark-exported", action="store_true",
                    help="Set exported_at on each row after writing it")
    args = ap.parse_args()

    client = _supabase_client()
    rows = fetch_verified(client, args.limit)
    print(f"Fetched {len(rows)} verified rows", file=sys.stderr)
    if not rows:
        return 0

    # Lazy-load the engine — heavy imports
    eng_mod = _ensure_engine()
    print(f"Loading {args.engine} engine …", file=sys.stderr)
    engine = eng_mod.create_engine(args.engine, load=True)

    written = 0
    with args.out.open("w", encoding="utf-8") as out_f:
        for i, row in enumerate(rows, 1):
            path = row.get("image_storage_path")
            if not path:
                print(f"  [{i}/{len(rows)}] skip {row['id']}: no image", file=sys.stderr)
                continue

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                if not download_image(client, path, tmp_path):
                    continue
                detections = engine.extract_detections(tmp_path, do_preprocess=True)
                if not detections:
                    print(f"  [{i}/{len(rows)}] skip {row['id']}: no OCR output", file=sys.stderr)
                    continue
                parse = row.get("verified_parse") or row.get("candidate_parse") or {}
                labels = label_tokens(detections, parse)
                rec = serialize_record(row, detections, labels)
                out_f.write(json.dumps(rec) + "\n")
                written += 1

                if args.mark_exported:
                    client.table("receipt_training_examples").update(
                        {"exported_at": "now()"}
                    ).eq("id", row["id"]).execute()
                print(
                    f"  [{i}/{len(rows)}] {row['id']}: {len(detections)} tokens, "
                    f"{sum(1 for l in labels if l != 'O')} labeled",
                    file=sys.stderr,
                )
            finally:
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    print(f"Wrote {written} records to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
