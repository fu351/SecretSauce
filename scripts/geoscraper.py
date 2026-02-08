#!/usr/bin/env python3
"""
Lightweight, reuse-friendly real-time scraper that focuses on a small set of ZIP codes.

This is intended to be triggered from GitHub Actions (or any webhook) whenever Supabase
detects a new ZIP code worth scraping. The workflow dispatch can pass a short list of ZIP
codes via inputs or an environment variable, and this script pulls those stores, filters
against the provided ZIPs, and only touches the brands you care about.
"""

from __future__ import annotations

import argparse
import io
import os
import time

import ijson
import requests
from supabase import Client

from scraper_common import (
    get_supabase_client,
    ENUM_TO_SPIDER,
    create_retry_session,
    build_store_key,
    gather_brand_filter_from_args,
    parse_store_from_feature,
    fetch_existing_store_keys,
    insert_store_batch,
    update_scraped_zipcodes,
    create_stats_dict,
    print_stats_summary,
)

supabase: Client = get_supabase_client()

# Rate limiting (keep low for real-time to stay responsive)
DELAY_BETWEEN_SPIDERS = 10
MAX_BATCH_SIZE = 100

# Primary + fallback output locations for AllThePlaces data.
# You can override/add the primary URL with ALLTHEPLACES_OUTPUT_BASE.
ALLTHEPLACES_OUTPUT_BASES = [
    os.environ.get("ALLTHEPLACES_OUTPUT_BASE"),
    "https://data.alltheplaces.xyz/runs/latest/output",
    "https://alltheplaces-data.openaddresses.io/runs/latest/output",
]
ALLTHEPLACES_OUTPUT_BASES = [
    base.rstrip("/")
    for base in ALLTHEPLACES_OUTPUT_BASES
    if base
]

# Known spider aliases in case a *_us name is missing from a particular run.
SPIDER_ALIASES: dict[str, list[str]] = {
    "aldi_us": ["aldi"],
    "kroger_us": ["kroger"],
    "meijer_us": ["meijer"],
    "target_us": ["target"],
    "walmart_us": ["walmart"],
    "trader_joes_us": ["trader_joes"],
    "99_ranch_market_us": ["99_ranch_market"],
    "whole_foods": ["whole_foods_us"],
}


def gather_zipcodes_from_args(args: argparse.Namespace) -> set[str]:
    """Collect ZIP codes from CLI, comma-separated strings, or an env var."""
    raw_values: list[str] = []
    raw_values.extend(args.zip or [])
    if args.zipcodes:
        raw_values.append(args.zipcodes)

    env_values = os.environ.get(args.env_zip_var or "REALTIME_TARGET_ZIPCODES")
    if env_values:
        raw_values.append(env_values)

    # Expand comma/space-separated values (similar to gather_brand_filter_from_args)
    expanded: list[str] = []
    for raw in raw_values:
        if not raw:
            continue
        # Replace commas with spaces so we can split on whitespace cleanly
        for part in raw.replace(",", " ").split():
            candidate = part.strip()
            if candidate:
                expanded.append(candidate)

    return set(expanded) if expanded else set()


def build_spider_candidates(spider_name: str) -> list[str]:
    """Return spider-name candidates in priority order, deduped."""
    candidates: list[str] = [spider_name]
    candidates.extend(SPIDER_ALIASES.get(spider_name, []))

    # Generic fallback for naming drift.
    if spider_name.endswith("_us"):
        candidates.append(spider_name[:-3])
    else:
        candidates.append(f"{spider_name}_us")

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        cleaned = candidate.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped


def fetch_features_with_fallback(session: requests.Session, spider_name: str, timeout: int = 90):
    """
    Fetch GeoJSON features trying multiple spider aliases and base URLs.
    Raises HTTPError only after all candidates are exhausted.
    """
    attempted_urls: list[str] = []
    last_404: requests.exceptions.HTTPError | None = None

    for candidate in build_spider_candidates(spider_name):
        for base_url in ALLTHEPLACES_OUTPUT_BASES:
            url = f"{base_url}/{candidate}.geojson"
            attempted_urls.append(url)
            try:
                with session.get(url, timeout=timeout) as response:
                    if response.status_code == 404:
                        continue
                    response.raise_for_status()
                    features = ijson.items(io.BytesIO(response.content), "features.item")
                    return candidate, url, features
            except requests.exceptions.HTTPError as error:
                if error.response is not None and error.response.status_code == 404:
                    last_404 = error
                    continue
                raise

    attempted = "\n".join(f"      - {url}" for url in attempted_urls)
    if last_404:
        message = (
            f"404 for spider '{spider_name}' after trying aliases and mirrors:\n"
            f"{attempted}"
        )
        raise requests.exceptions.HTTPError(message, response=last_404.response)

    raise requests.exceptions.RequestException(
        f"Unable to fetch spider '{spider_name}'. URLs attempted:\n{attempted}"
    )


def run_geoscraper(target_zipcodes: set[str] | None, brand_filter: set[str] | None, *,
                   dry_run: bool = False):
    brands_to_process = brand_filter if brand_filter else set(ENUM_TO_SPIDER.keys())
    stats = create_stats_dict()
    zips_with_stores: dict[str, int] = {}

    # Fetch existing stores for duplicate detection
    # If target_zipcodes provided, optimize by only fetching those ZIPs
    # Otherwise, fetch all existing stores for the brands (slower but necessary)
    existing_stores, existing_null_address_pairs = fetch_existing_store_keys(
        supabase, brands_to_process, target_zipcodes
    )

    stores_to_insert: list[dict] = []
    spider_count = 0
    total_spiders = len(brands_to_process)

    if target_zipcodes:
        print(f"🔍 Real-time scrape for {len(target_zipcodes)} ZIP codes across {total_spiders} brands")
    else:
        print(f"🔍 Nationwide scrape across {total_spiders} brands")

    for brand_enum in brands_to_process:
        spider_count += 1
        spider_name = ENUM_TO_SPIDER.get(brand_enum)
        if not spider_name:
            print(f"⚠️  No spider mapped for {brand_enum}; skipping")
            continue

        print(f"\n📂 [{spider_count}/{total_spiders}] {brand_enum} → {spider_name}")

        try:
            session = create_retry_session(retries=3, backoff_factor=2)
            resolved_spider, resolved_url, features = fetch_features_with_fallback(session, spider_name, timeout=90)
            print(f"   URL: {resolved_url}")
            if resolved_spider != spider_name:
                print(f"   ℹ️  Using alias spider '{resolved_spider}' for '{spider_name}'")

            store_count = 0
            for feature in features:
                # Parse the feature into a store record
                store_record = parse_store_from_feature(feature, brand_enum)

                # Skip if parsing failed (no name, zip, or geometry)
                if not store_record:
                    stats["no_geometry"] += 1
                    continue

                zip_code = store_record["zip_code"]

                store_key = build_store_key(brand_enum, store_record["name"], zip_code)
                if store_key in existing_stores:
                    stats["duplicates_skipped"] += 1
                    continue

                # If we don't have a street address, only insert one per brand+ZIP to satisfy the partial unique index.
                street_address = store_record["address"]
                null_address_pair = (brand_enum, zip_code)
                if not street_address and null_address_pair in existing_null_address_pairs:
                    stats["duplicates_skipped"] += 1
                    continue

                if not street_address:
                    existing_null_address_pairs.add(null_address_pair)

                stores_to_insert.append(store_record)
                existing_stores.add(store_key)
                store_count += 1

                if len(stores_to_insert) >= MAX_BATCH_SIZE:
                    insert_store_batch(supabase, stores_to_insert, zips_with_stores, stats, dry_run)
                    stores_to_insert = []

            print(f"   📊 Matched {store_count} stores in target ZIPs")

        except requests.exceptions.HTTPError as e:
            stats["errors"] += 1
            status_code = e.response.status_code if e.response is not None else "unknown"
            print(f"   ❌ HTTP {status_code} for {spider_name}: {e}")
            if isinstance(status_code, int) and status_code >= 500:
                print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s (server error)")
                time.sleep(DELAY_BETWEEN_SPIDERS)
        except requests.exceptions.RequestException as e:
            stats["errors"] += 1
            print(f"   ❌ Request error: {e}")
            print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s before next spider")
            time.sleep(DELAY_BETWEEN_SPIDERS)
        except Exception as e:
            stats["errors"] += 1
            print(f"   ❌ Unexpected error: {type(e).__name__}: {e}")

        if spider_count < total_spiders:
            print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s before next spider")
            time.sleep(DELAY_BETWEEN_SPIDERS)

    if stores_to_insert:
        insert_store_batch(supabase, stores_to_insert, zips_with_stores, stats, dry_run)

    if not dry_run and zips_with_stores:
        update_scraped_zipcodes(supabase, zips_with_stores)

    # Print final statistics
    print("\n" + "=" * 60)
    print("🛰️  Geoscraper run complete")
    print("=" * 60)
    print_stats_summary(stats, target_zipcodes)


def main():
    parser = argparse.ArgumentParser(
        description="Real-time scraper triggered for specific ZIP codes."
    )
    parser.add_argument(
        "--zip",
        "-z",
        action="append",
        help="(Optional) Target ZIP code for tracking purposes (can be repeated)."
    )
    parser.add_argument(
        "--zipcodes",
        help="(Optional) Comma or space-separated list of ZIP codes for tracking (legacy)."
    )
    parser.add_argument(
        "--env-zip-var",
        help="Environment variable that stores a comma-separated list of ZIP codes.",
        default="REALTIME_TARGET_ZIPCODES",
    )
    parser.add_argument(
        "--brand",
        "-b",
        action="append",
        help="Limit to specific store_enum values (comma or space separated; can be repeated)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without committing inserts (print what would happen)."
    )

    args = parser.parse_args()
    target_zipcodes = gather_zipcodes_from_args(args)

    # If no ZIP codes provided, set to None (will scrape nationwide)
    if not target_zipcodes:
        target_zipcodes = None

    brand_filter = gather_brand_filter_from_args(args.brand or [])
    run_geoscraper(target_zipcodes, brand_filter, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
