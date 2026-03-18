#!/usr/bin/env python3
"""Single entrypoint for store maintenance operations."""

from __future__ import annotations

import argparse
import os

from store_maintenance_utils import common


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Store maintenance orchestrator")
    parser.add_argument("--mode", required=True, choices=["import", "geo_fix", "backfill"])

    parser.add_argument("--brands", help="Comma/space-separated brand list")
    parser.add_argument("--max-spiders", type=int, default=2)

    parser.add_argument("--zipcodes", help="Comma/space-separated ZIP list")
    parser.add_argument("--zip", "-z", action="append", help="ZIP list (repeatable)")

    parser.add_argument("--run-update-target-zipcodes", default="true")
    parser.add_argument("--neighbor-radius", type=int, default=5)
    parser.add_argument("--import-all-zipcodes", action="store_true")
    parser.add_argument("--mark-events-completed", default="true")

    parser.add_argument("--backfill-limit", type=int, default=100)
    parser.add_argument("--backfill-delay", type=float, default=0.1)
    parser.add_argument("--backfill-loop", default="false")
    parser.add_argument("--backfill-max-batches", type=int, default=0)
    parser.add_argument("--backfill-concurrency", type=int, default=10)

    return parser.parse_args()


def _gather_brands(args: argparse.Namespace) -> set[str] | None:
    raw_values: list[str] = []
    if args.brands:
        raw_values.append(args.brands)
    brand_filter = common.parse_token_set(raw_values)
    return brand_filter if brand_filter else None


def _gather_zip_codes(args: argparse.Namespace) -> set[str]:
    raw_values: list[str] = []
    raw_values.extend(args.zip or [])
    if args.zipcodes:
        raw_values.append(args.zipcodes)
    return common.parse_token_set(raw_values)


def _run_import(args: argparse.Namespace) -> None:
    os.environ["MAX_SPIDERS_PER_RUN"] = str(max(0, args.max_spiders))
    from store_maintenance_utils import import_new_stores as importer
    from update_target_zipcodes import update_target_zipcodes

    zip_codes = _gather_zip_codes(args)
    brand_filter = _gather_brands(args)

    if common.parse_bool(args.run_update_target_zipcodes, default=True):
        try:
            update_target_zipcodes(add_neighbors=True, neighbor_radius=args.neighbor_radius)
        except Exception as error:
            print(f"⚠️  update_target_zipcodes failed: {error}")
            print("ℹ️  Continuing import with existing target ZIP data.")

    use_target_zipcodes = (not args.import_all_zipcodes) and (not zip_codes)
    importer.import_new_stores(
        brand_filter=brand_filter,
        use_target_zipcodes=use_target_zipcodes,
        explicit_target_zipcodes=zip_codes or None,
    )

    if zip_codes and common.parse_bool(args.mark_events_completed, default=True):
        count = common.mark_scraping_events_completed(zip_codes)
        print(f"✅ Marked {count} events as completed")


def _run_geo_fix(args: argparse.Namespace) -> None:
    os.environ["MAX_SPIDERS_PER_RUN"] = str(max(0, args.max_spiders))
    from store_maintenance_utils import fix_missing_geo as geo_fix

    brand_filter = _gather_brands(args)
    geo_fix.fix_missing_geometry(brand_filter)


def _run_backfill(args: argparse.Namespace) -> None:
    from store_maintenance_utils import backfill_scraped_zipcodes as backfill

    zip_codes = _gather_zip_codes(args)
    max_batches = args.backfill_max_batches if args.backfill_max_batches > 0 else None
    loop = common.parse_bool(args.backfill_loop, default=False)

    backfill.run_backfill(
        limit=args.backfill_limit,
        delay=args.backfill_delay,
        dry_run=False,
        loop=loop,
        max_batches=max_batches,
        concurrency=max(1, args.backfill_concurrency),
        zip_filter=zip_codes or None,
    )


def main() -> None:
    args = _parse_args()
    if args.mode == "import":
        _run_import(args)
    elif args.mode == "geo_fix":
        _run_geo_fix(args)
    elif args.mode == "backfill":
        _run_backfill(args)
    else:
        raise ValueError(f"Unsupported mode: {args.mode}")


if __name__ == "__main__":
    main()
