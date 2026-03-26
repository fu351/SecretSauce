"""Import new grocery stores from the All the Places dataset."""

from __future__ import annotations

import argparse
import os
import time

import requests
from supabase import Client

from .alltheplaces import fetch_features_with_fallback
from .db import (
    fetch_existing_store_keys,
    get_supabase_client,
    insert_store_batch,
    update_scraped_zipcodes,
)
from .utils import (
    ENUM_TO_SPIDER,
    build_store_key,
    create_retry_session,
    create_stats_dict,
    gather_brand_filter_from_args,
    parse_store_from_feature,
    print_stats_summary,
)

# Rate limiting
DELAY_BETWEEN_SPIDERS = 15
DELAY_AFTER_ERROR = 60

# Batch processing
MAX_SPIDERS_PER_RUN = int(os.environ.get("MAX_SPIDERS_PER_RUN", "0")) or None
BATCH_SIZE = 100

supabase: Client = get_supabase_client()


def gather_zipcodes_from_args(args: argparse.Namespace) -> set[str]:
    """Collect ZIP codes from CLI args or an env var."""
    raw_values: list[str] = []
    raw_values.extend(args.zip or [])
    if args.zipcodes:
        raw_values.append(args.zipcodes)
    env_values = os.environ.get(args.env_zip_var or "IMPORT_TARGET_ZIPCODES")
    if env_values:
        raw_values.append(env_values)
    expanded: list[str] = []
    for raw in raw_values:
        if not raw:
            continue
        for part in raw.replace(",", " ").split():
            candidate = part.strip()
            if candidate:
                expanded.append(candidate)
    return set(expanded) if expanded else set()


def _load_target_zipcodes_from_db() -> set[str] | None:
    """Load target ZIP codes from the target_zipcodes table."""
    print("🎯 Loading target ZIP codes (user locations + neighbors)...")
    try:
        target_response = (
            supabase.table("target_zipcodes")
            .select("zip_code, priority, user_count")
            .order("priority", desc=True)
            .execute()
        )
        target_zipcodes = {row["zip_code"] for row in target_response.data}
        if not target_zipcodes:
            print("   ⚠️  No target ZIP codes found!")
            print("   💡 Run: python -m workers.store_maintenance_worker.update_target_zipcodes")
            return None
        print(f"   📍 Targeting {len(target_zipcodes)} ZIP codes based on user locations")
        print("   🔝 Top priority ZIPs:")
        for zip_data in target_response.data[:5]:
            print(f"      {zip_data['zip_code']}: {zip_data['user_count']} users")
        return target_zipcodes
    except Exception as e:
        print(f"   ⚠️  Could not load target ZIP codes: {e}")
        print("   ℹ️  Proceeding without ZIP filtering (will scrape all stores)")
        return None


def import_new_stores(
    brand_filter: set[str] | None = None,
    use_target_zipcodes: bool = True,
    explicit_target_zipcodes: set[str] | None = None,
) -> None:
    print("🔍 Starting store import from All the Places...")
    if brand_filter:
        print(f"   🔖 Brand filter applied: {', '.join(sorted(brand_filter))}")

    target_zipcodes = None
    if explicit_target_zipcodes:
        target_zipcodes = explicit_target_zipcodes
        print(f"🎯 Using explicit ZIP target list ({len(target_zipcodes)} ZIPs)")
    elif use_target_zipcodes:
        target_zipcodes = _load_target_zipcodes_from_db()

    stats = create_stats_dict()
    zips_with_stores: dict[str, int] = {}
    brands_to_process = brand_filter if brand_filter else set(ENUM_TO_SPIDER.keys())

    if MAX_SPIDERS_PER_RUN and len(brands_to_process) > MAX_SPIDERS_PER_RUN:
        brands_to_process = set(list(brands_to_process)[:MAX_SPIDERS_PER_RUN])
        print(f"⚙️  MAX_SPIDERS_PER_RUN={MAX_SPIDERS_PER_RUN}: Processing {len(brands_to_process)} brands")

    print("\n📊 Fetching existing stores from database...")
    existing_stores, existing_null_address_pairs = fetch_existing_store_keys(
        supabase, brands_to_process, target_zipcodes
    )
    print(f"   Found {len(existing_stores)} existing stores across {len(brands_to_process)} brands")

    stores_to_insert: list[dict] = []
    spider_count = 0
    total_spiders = len(brands_to_process)

    for brand_enum in brands_to_process:
        spider_count += 1
        spider = ENUM_TO_SPIDER.get(brand_enum)
        if not spider:
            print(f"⚠️ No spider mapped for brand enum: {brand_enum}")
            continue

        print(f"\n📂 [{spider_count}/{total_spiders}] Processing spider '{spider}'...")

        try:
            session = create_retry_session(retries=3, backoff_factor=3)
            resolved_spider, resolved_url, features = fetch_features_with_fallback(
                session, spider, timeout=120
            )
            print(f"   URL: {resolved_url}")
            if resolved_spider != spider:
                print(f"   ℹ️  Using alias spider '{resolved_spider}' for '{spider}'")

            store_count = 0
            for feature in features:
                store_record = parse_store_from_feature(feature, brand_enum)
                if not store_record:
                    stats["no_geometry"] += 1
                    continue

                zip_code = store_record["zip_code"]
                if target_zipcodes and zip_code not in target_zipcodes:
                    stats["wrong_zipcode"] += 1
                    continue

                store_key = build_store_key(brand_enum, store_record["name"], zip_code)
                if store_key in existing_stores:
                    stats["duplicates_skipped"] += 1
                    continue

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

                if len(stores_to_insert) >= BATCH_SIZE:
                    insert_store_batch(supabase, stores_to_insert, zips_with_stores, stats)
                    stores_to_insert = []

            print(f"   📊 Processed {store_count} new stores from {spider}")

        except requests.exceptions.HTTPError as e:
            if e.response.status_code >= 500:
                print(f"   ❌ Server error {e.response.status_code} for {spider} - retries exhausted")
                print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing...")
                time.sleep(DELAY_AFTER_ERROR)
            else:
                print(f"   ❌ HTTP error {e.response.status_code}: {e}")
            stats["errors"] += 1
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error processing {spider}: {e}")
            print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing...")
            time.sleep(DELAY_AFTER_ERROR)
            stats["errors"] += 1
        except Exception as e:
            print(f"   ❌ Unexpected error processing {spider}: {type(e).__name__}: {e}")
            stats["errors"] += 1

        if spider_count < total_spiders:
            print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s before next spider... ({spider_count}/{total_spiders})")
            time.sleep(DELAY_BETWEEN_SPIDERS)

    if stores_to_insert:
        try:
            insert_store_batch(supabase, stores_to_insert, zips_with_stores, stats)
            print(f"\n✅ Inserted final batch of {len(stores_to_insert)} stores")
        except Exception as e:
            print(f"\n❌ Error inserting final batch: {e}")
            stats["errors"] += 1

    if target_zipcodes:
        update_scraped_zipcodes(supabase, zips_with_stores)

    print_stats_summary(stats, target_zipcodes)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import new grocery stores from All the Places.")
    parser.add_argument("--zip", "-z", action="append",
                        help="Optional ZIP code target list (repeatable; comma/space-separated).")
    parser.add_argument("--zipcodes",
                        help="Optional comma or space-separated ZIP code target list.")
    parser.add_argument("--env-zip-var", default="IMPORT_TARGET_ZIPCODES",
                        help="Environment variable containing ZIP code targets.")
    parser.add_argument("--brand", "-b", action="append",
                        help="Limit to specific store_enum values (repeatable; comma/space-separated).")
    parser.add_argument("--all-zipcodes", action="store_true",
                        help="Scrape all ZIP codes instead of just target ZIPs.")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    brand_filter = gather_brand_filter_from_args(args.brand or [])
    explicit_target_zipcodes = gather_zipcodes_from_args(args)
    use_target_zipcodes = not args.all_zipcodes and not explicit_target_zipcodes
    import_new_stores(
        brand_filter,
        use_target_zipcodes,
        explicit_target_zipcodes=explicit_target_zipcodes if explicit_target_zipcodes else None,
    )


if __name__ == "__main__":
    main()
