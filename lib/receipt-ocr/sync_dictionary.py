"""
sync_dictionary.py
==================
One-shot sync from Supabase ``standardized_ingredients`` to the receipt-OCR
dictionary file.

Why a sync script (not a runtime call)
--------------------------------------
The receipt parser is intentionally stdlib-only — it must work in
environments without network access (CI, local dev, Lambda cold starts).
We therefore export the canonical vocabulary to a flat text file that the
parser loads at import time. Re-run this script whenever
``standardized_ingredients`` is materially expanded.

Why we don't simply replace the in-code dictionary
--------------------------------------------------
``receipt_dictionary.py`` keeps a hand-curated builtin set tuned to common
OCR confusion pairs (e.g. "BNANAS" → "BANANAS"). The Supabase canonical
vocabulary is broader and noisier. We use the Supabase set as additional
*coverage*, layered on top of the builtins, so the dictionary's existing
tuning is not lost.

Output
------
Writes one term per line, uppercase, ASCII-only, length >= 3, to:
    lib/receipt-ocr/standardized_vocab.txt

The file is read by ``receipt_dictionary.py`` (see ``_load_standardized_vocab``)
and merged with the in-code builtins to form ``GROCERY_TERMS``.

Usage
-----
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python lib/receipt-ocr/sync_dictionary.py

    # Dry run (print to stdout instead of writing the file):
    python lib/receipt-ocr/sync_dictionary.py --dry-run

    # Limit to first N rows (useful for testing):
    python lib/receipt-ocr/sync_dictionary.py --limit 1000
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

OUTPUT_PATH = Path(__file__).resolve().parent / "standardized_vocab.txt"

# Canonical names like "Worcestershire sauce" become individual tokens
# WORCESTERSHIRE and SAUCE — the dictionary corrects word-by-word, so
# multi-word entries don't add value as compound strings.
_TOKEN_RE = re.compile(r"[A-Za-z]{3,}")


def _normalize_canonical(name: str) -> set[str]:
    """Tokenize a canonical name into uppercase ASCII alphabetic tokens (≥3 chars)."""
    if not name:
        return set()
    # Drop any non-ASCII first to avoid e.g. "café" producing "café" tokens
    ascii_name = name.encode("ascii", "ignore").decode("ascii")
    return {tok.upper() for tok in _TOKEN_RE.findall(ascii_name)}


def fetch_canonical_names(limit: int | None = None) -> list[str]:
    """Pull all canonical_name values from standardized_ingredients.

    Filters to is_food_item=True (or NULL — old rows pre-flag). Non-food
    rows like "AAA Battery" don't help receipt parsing.
    """
    try:
        from supabase import create_client
    except ImportError as e:
        sys.exit(
            f"supabase SDK not installed: {e}\n"
            "  pip install supabase==2.3.4"
        )

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
        )

    client = create_client(url, key)
    page_size = 1000
    names: list[str] = []
    offset = 0
    while True:
        end = offset + page_size - 1
        if limit is not None:
            end = min(end, limit - 1)
        q = (
            client.table("standardized_ingredients")
            .select("canonical_name, is_food_item")
            .or_("is_food_item.eq.true,is_food_item.is.null")
            .range(offset, end)
            .order("canonical_name")
        )
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break
        names.extend(
            r["canonical_name"] for r in rows if r.get("canonical_name")
        )
        if len(rows) < page_size:
            break
        offset += page_size
        if limit is not None and offset >= limit:
            break
    return names


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Print to stdout instead of writing the output file",
    )
    ap.add_argument(
        "--limit", type=int, default=None,
        help="Cap the number of canonical-name rows fetched (for testing)",
    )
    ap.add_argument(
        "--output", type=Path, default=OUTPUT_PATH,
        help=f"Output path (default: {OUTPUT_PATH})",
    )
    args = ap.parse_args()

    names = fetch_canonical_names(limit=args.limit)
    print(f"Fetched {len(names)} canonical_name rows", file=sys.stderr)

    tokens: set[str] = set()
    for name in names:
        tokens.update(_normalize_canonical(name))

    sorted_tokens = sorted(tokens)
    print(f"Distinct ASCII tokens (>=3 chars): {len(sorted_tokens)}", file=sys.stderr)

    out = "\n".join(sorted_tokens) + "\n"
    if args.dry_run:
        print(out)
    else:
        args.output.write_text(out, encoding="utf-8")
        print(f"Wrote {len(sorted_tokens)} tokens to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
