"""Precompute Epicure ingredient swaps into the Supabase `ingredient_swaps` table.

The "Both" integration: the FastAPI `/epicure/swap` endpoint serves dynamic
queries, while this one-off batch job materializes a fast-read cache so the app
can look swaps up by standardized ingredient without a live model call.

Pure helpers (`build_name_to_id`, `build_swap_rows`) are unit-tested. The DB
read/write path lives in `main()` and only runs when invoked directly:

    py export_ingredient_swaps.py --dry-run          # build rows, print counts, write nothing
    py export_ingredient_swaps.py --limit 50         # only the first 50 source ingredients
    py export_ingredient_swaps.py                     # full run (needs SUPABASE_SERVICE_ROLE_KEY)

The fallback substitution data in `canonical_substitution_proposals` is never
touched, so if the Epicure swaps underperform the app can revert to it.
"""
from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from epicure_names import to_token
from epicure_service import DEFAULT_MODEL_REVISIONS, EpicureService, load_default

logger = logging.getLogger("export_ingredient_swaps")

SWAPS_PER_INGREDIENT = 8
UPSERT_BATCH_SIZE = 500
TABLE = "ingredient_swaps"


def build_name_to_id(standardized_rows: list[dict]) -> dict[str, str]:
    """Map Epicure token space -> standardized_ingredients.id.

    Canonical names are tokenized the same way Epicure tokens are, so
    "black pepper" (canonical) and "black_pepper" (Epicure) line up.
    """
    mapping: dict[str, str] = {}
    for row in standardized_rows:
        token = to_token(row.get("canonical_name") or "")
        if token:
            mapping[token] = row["id"]
    return mapping


def build_swap_rows(
    swap_service,
    name_to_id: dict[str, str],
    tokens,
    *,
    k: int = SWAPS_PER_INGREDIENT,
    source: str = "epicure",
    model_version: Optional[str] = None,
) -> list[dict]:
    """Build `ingredient_swaps` rows for the given source tokens.

    Source tokens with no standardized id are skipped entirely; a swap whose
    token has no standardized id is still recorded (id left None) so the
    suggestion survives even when it isn't a known standardized ingredient.
    """
    rows: list[dict] = []
    for token in tokens:
        source_id = name_to_id.get(token)
        if not source_id:
            continue
        for rank, swap in enumerate(swap_service.swap(token, k=k), start=1):
            swap_token = swap["token"]
            rows.append(
                {
                    "standardized_ingredient_id": source_id,
                    "swap_standardized_ingredient_id": name_to_id.get(swap_token),
                    "swap_token": swap_token,
                    "swap_display_name": swap["ingredient"],
                    "score": swap["score"],
                    "rank": rank,
                    "source": source,
                    "model_version": model_version,
                }
            )
    return rows


def _model_version_label() -> str:
    parts = []
    for name in ("core", "chem"):
        entry = DEFAULT_MODEL_REVISIONS.get(name)
        if entry:
            parts.append(f"{name}@{entry[1][:7]}")
    return "+".join(parts)


def _fetch_standardized_ingredients(supabase) -> list[dict]:
    """Page through standardized_ingredients (id, canonical_name)."""
    rows: list[dict] = []
    page_size = 1000
    start = 0
    while True:
        resp = (
            supabase.table("standardized_ingredients")
            .select("id, canonical_name")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = resp.data
        if batch is None:
            # supabase-py raises on hard errors; a None payload signals an
            # unexpected soft failure that must not be masked as "no rows".
            raise RuntimeError("standardized_ingredients fetch returned no data payload")
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def _load_env() -> None:
    """Best-effort load of the repo-root .env.local for local runs (no-op in prod).

    Only the optional `python-dotenv` import is treated as best-effort; a genuine
    failure to read/parse a present .env.local is allowed to propagate so a
    corrupt file is diagnosable instead of silently ignored.
    """
    try:
        from dotenv import load_dotenv
    except ImportError:
        return  # python-dotenv not installed; rely on the ambient environment

    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(here, ".env.local"),
        os.path.join(here, "..", ".env.local"),
    ):
        if os.path.exists(candidate):
            load_dotenv(candidate, override=False)
            return


def _create_supabase():
    from supabase import create_client

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set to run the export"
        )
    return create_client(url, key)


def _chunk(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def main(argv: Optional[list[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Export Epicure swaps into Supabase ingredient_swaps")
    parser.add_argument("--dry-run", action="store_true", help="Build rows and report counts; write nothing")
    parser.add_argument("--limit", type=int, default=0, help="Only process the first N source ingredients")
    parser.add_argument("--k", type=int, default=SWAPS_PER_INGREDIENT, help="Swaps per ingredient")
    args = parser.parse_args(argv)

    _load_env()
    logger.info("Loading Epicure models (core + chem)...")
    service: EpicureService = load_default(
        {name: DEFAULT_MODEL_REVISIONS[name] for name in ("core", "chem")}
    )

    supabase = _create_supabase()
    logger.info("Fetching standardized ingredients...")
    standardized = _fetch_standardized_ingredients(supabase)
    name_to_id = build_name_to_id(standardized)
    logger.info("Mapped %d standardized ingredients into token space", len(name_to_id))

    tokens = service.tokens(model="core")
    if args.limit > 0:
        tokens = tokens[: args.limit]
    logger.info("Building swap rows for %d source tokens (k=%d)...", len(tokens), args.k)

    rows = build_swap_rows(
        service, name_to_id, tokens, k=args.k, model_version=_model_version_label()
    )
    matched_sources = len({r["standardized_ingredient_id"] for r in rows})
    logger.info("Built %d swap rows across %d standardized source ingredients", len(rows), matched_sources)

    if args.dry_run:
        logger.info("Dry run: not writing. Sample row: %s", rows[0] if rows else "(none)")
        return 0

    written = 0
    failed_batches = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for index, batch in enumerate(_chunk(rows, UPSERT_BATCH_SIZE)):
        # Stamp updated_at so re-runs refresh the cache's freshness signal
        # (upsert-on-conflict does not re-apply the column default).
        stamped = [{**row, "updated_at": now_iso} for row in batch]
        try:
            supabase.table(TABLE).upsert(
                stamped, on_conflict="standardized_ingredient_id,swap_token"
            ).execute()
        except Exception as exc:
            failed_batches += 1
            logger.error("Upsert batch %d failed at offset %d/%d: %s", index, written, len(rows), exc)
            continue
        written += len(batch)
        logger.info("Upserted %d/%d rows", written, len(rows))

    if failed_batches:
        logger.error(
            "Export finished with %d failed batch(es); only %d/%d rows written",
            failed_batches,
            written,
            len(rows),
        )
        return 1

    logger.info("Done. Wrote %d ingredient_swaps rows.", written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
