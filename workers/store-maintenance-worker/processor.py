"""Mode processors for the store-maintenance worker."""

from __future__ import annotations

import argparse
import os

from .config import gather_brands, gather_zip_codes
from .db import mark_scraping_events_completed
from .utils import parse_bool


def run_import(args: argparse.Namespace) -> None:
    os.environ["MAX_SPIDERS_PER_RUN"] = str(max(0, args.max_spiders))
    from . import import_new_stores as importer
    from .update_target_zipcodes import update_target_zipcodes

    zip_codes = gather_zip_codes(args)
    brand_filter = gather_brands(args)

    if parse_bool(args.run_update_target_zipcodes, default=True):
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

    if zip_codes and parse_bool(args.mark_events_completed, default=True):
        count = mark_scraping_events_completed(zip_codes)
        print(f"✅ Marked {count} events as completed")


def run_geo_fix(args: argparse.Namespace) -> None:
    os.environ["MAX_SPIDERS_PER_RUN"] = str(max(0, args.max_spiders))
    from . import fix_missing_geo as geo_fix

    brand_filter = gather_brands(args)
    geo_fix.fix_missing_geometry(brand_filter)


def run_backfill(args: argparse.Namespace) -> None:
    from . import backfill_scraped_zipcodes as backfill

    zip_codes = gather_zip_codes(args)
    max_batches = args.backfill_max_batches if args.backfill_max_batches > 0 else None
    loop = parse_bool(args.backfill_loop, default=False)

    backfill.run_backfill(
        limit=args.backfill_limit,
        delay=args.backfill_delay,
        dry_run=False,
        loop=loop,
        max_batches=max_batches,
        concurrency=max(1, args.backfill_concurrency),
        zip_filter=zip_codes or None,
    )
