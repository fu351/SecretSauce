import argparse
import os
import time
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
from store_maintenance_utils.alltheplaces import fetch_features_with_fallback

# 1. Setup
supabase: Client = get_supabase_client()

# Rate limiting configuration
DELAY_BETWEEN_SPIDERS = 15  # seconds between processing different spiders (increased for API health)
DELAY_AFTER_ERROR = 60     # seconds to wait after server errors before continuing (longer recovery time)

# Batch processing configuration
MAX_SPIDERS_PER_RUN = int(os.environ.get("MAX_SPIDERS_PER_RUN", "0")) or None  # None = no limit
BATCH_SIZE = 100  # Insert in batches of 100

def gather_zipcodes_from_args(args: argparse.Namespace) -> set[str]:
    """Collect ZIP codes from CLI, comma-separated strings, or an env var."""
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
    """Load target ZIP codes from Supabase target_zipcodes table."""
    print("🎯 Loading target ZIP codes (user locations + neighbors)...")
    try:
        target_query = supabase.table("target_zipcodes") \
            .select("zip_code, priority, user_count") \
            .order("priority", desc=True)

        target_response = target_query.execute()
        target_zipcodes = set(row["zip_code"] for row in target_response.data)

        if not target_zipcodes:
            print("   ⚠️  No target ZIP codes found!")
            print("   💡 Run: python scripts/update_target_zipcodes.py")
            return None

        print(f"   📍 Targeting {len(target_zipcodes)} ZIP codes based on user locations")
        print("   🔝 Top priority ZIPs:")
        for zip_data in target_response.data[:5]:
            print(f"      {zip_data['zip_code']}: {zip_data['user_count']} users")

        return target_zipcodes
    except Exception as e:
        print(f"   ⚠️  Could not load target ZIP codes: {e}")
        print("   ℹ️  Make sure to run the migration: scripts/migrations/create_scraped_zipcodes_table.sql")
        print("   ℹ️  Proceeding without ZIP filtering (will scrape all stores)")
        return None


def import_new_stores(
    brand_filter: set[str] | None = None,
    use_target_zipcodes: bool = True,
    explicit_target_zipcodes: set[str] | None = None,
):
    print("🔍 Starting store import from All the Places...")
    if brand_filter:
        print(f"   🔖 Brand filter applied: {', '.join(sorted(brand_filter))}")

    target_zipcodes = None
    if explicit_target_zipcodes:
        target_zipcodes = explicit_target_zipcodes
        print(f"🎯 Using explicit ZIP target list ({len(target_zipcodes)} ZIPs)")
    elif use_target_zipcodes:
        target_zipcodes = _load_target_zipcodes_from_db()

    # Statistics tracking
    stats = create_stats_dict()
    zips_with_stores: dict[str, int] = {}

    # Determine which brands to process
    brands_to_process = brand_filter if brand_filter else set(ENUM_TO_SPIDER.keys())

    # Limit brands if MAX_SPIDERS_PER_RUN is set
    if MAX_SPIDERS_PER_RUN and len(brands_to_process) > MAX_SPIDERS_PER_RUN:
        brands_to_process = set(list(brands_to_process)[:MAX_SPIDERS_PER_RUN])
        print(f"⚙️  MAX_SPIDERS_PER_RUN={MAX_SPIDERS_PER_RUN}: Processing {len(brands_to_process)} brands")

    # Fetch existing stores for each brand to check for duplicates
    print(f"\n📊 Fetching existing stores from database...")
    existing_stores, existing_null_address_pairs = fetch_existing_store_keys(
        supabase, brands_to_process, target_zipcodes
    )
    print(f"   Found {len(existing_stores)} existing stores across {len(brands_to_process)} brands")

    # Track stores to insert in batches
    stores_to_insert = []

    # Track which iteration we're on for rate limiting
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
            # Create session with retry logic for transient failures
            # Higher backoff_factor to avoid hammering struggling servers
            session = create_retry_session(retries=3, backoff_factor=3)

            resolved_spider, resolved_url, features = fetch_features_with_fallback(session, spider, timeout=120)
            print(f"   URL: {resolved_url}")
            if resolved_spider != spider:
                print(f"   ℹ️  Using alias spider '{resolved_spider}' for '{spider}'")

            store_count = 0
            for feature in features:
                # Parse the feature into a store record
                store_record = parse_store_from_feature(feature, brand_enum)

                # Skip if parsing failed (no name, zip, or geometry)
                if not store_record:
                    stats["no_geometry"] += 1
                    continue

                zip_code = store_record["zip_code"]

                # Filter by target ZIP codes if enabled
                if target_zipcodes and zip_code not in target_zipcodes:
                    stats["wrong_zipcode"] += 1
                    continue

                # Check if store already exists
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

                # Track null address pairs
                if not street_address:
                    existing_null_address_pairs.add(null_address_pair)

                stores_to_insert.append(store_record)
                existing_stores.add(store_key)  # Add to set to prevent duplicates within this run
                store_count += 1

                # Insert in batches to avoid large transactions
                if len(stores_to_insert) >= BATCH_SIZE:
                    insert_store_batch(supabase, stores_to_insert, zips_with_stores, stats)
                    stores_to_insert = []

            print(f"   📊 Processed {store_count} new stores from {spider}")

        except requests.exceptions.HTTPError as e:
            if e.response.status_code >= 500:
                print(f"   ❌ Server error {e.response.status_code} for {spider} - retries exhausted")
                print(f"   💡 All the Places server may be overloaded. Consider:")
                print(f"       • Using --brand to process fewer spiders")
                print(f"       • Running at off-peak hours")
                print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing to let server recover...")
                time.sleep(DELAY_AFTER_ERROR)
            else:
                print(f"   ❌ HTTP error {e.response.status_code}: {e}")
            stats["errors"] += 1
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error processing {spider}: {e}")
            # Network errors often indicate server overload, wait before continuing
            print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing...")
            time.sleep(DELAY_AFTER_ERROR)
            stats["errors"] += 1
        except Exception as e:
            print(f"   ❌ Unexpected error processing {spider}: {type(e).__name__}: {e}")
            stats["errors"] += 1

        # Add delay between spiders to avoid overwhelming the server
        if spider_count < total_spiders:
            print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s before next spider... ({spider_count}/{total_spiders})")
            time.sleep(DELAY_BETWEEN_SPIDERS)

    # Insert remaining stores
    if stores_to_insert:
        try:
            insert_store_batch(supabase, stores_to_insert, zips_with_stores, stats)
            print(f"\n✅ Inserted final batch of {len(stores_to_insert)} stores")
        except Exception as e:
            print(f"\n❌ Error inserting final batch: {e}")
            stats["errors"] += 1

    # Update scraped ZIP codes tracking for ZIP-targeted runs.
    if target_zipcodes:
        update_scraped_zipcodes(supabase, zips_with_stores)

    # Print final statistics
    print_stats_summary(stats, target_zipcodes)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import new grocery stores from All the Places.")
    parser.add_argument(
        "--zip",
        "-z",
        action="append",
        help="Optional ZIP code target list (can be repeated; comma/space-separated supported)."
    )
    parser.add_argument(
        "--zipcodes",
        help="Optional comma or space-separated ZIP code target list."
    )
    parser.add_argument(
        "--env-zip-var",
        help="Environment variable containing ZIP code targets (default: IMPORT_TARGET_ZIPCODES).",
        default="IMPORT_TARGET_ZIPCODES"
    )
    parser.add_argument(
        "--brand",
        "-b",
        action="append",
        help="Limit the run to specific store_enum values (comma or space separated; can be repeated)."
    )
    parser.add_argument(
        "--all-zipcodes",
        action="store_true",
        help="Scrape all ZIP codes instead of just target ZIPs near users (not recommended for production)."
    )
    return parser.parse_args()


def _gather_brand_filter(args: argparse.Namespace) -> set[str] | None:
    """Wrapper to use the common brand filter gathering function."""
    return gather_brand_filter_from_args(args.brand or [])


def main() -> None:
    args = _parse_args()
    brand_filter = _gather_brand_filter(args)
    explicit_target_zipcodes = gather_zipcodes_from_args(args)
    use_target_zipcodes = not args.all_zipcodes and not explicit_target_zipcodes
    import_new_stores(
        brand_filter,
        use_target_zipcodes,
        explicit_target_zipcodes=explicit_target_zipcodes if explicit_target_zipcodes else None,
    )


if __name__ == "__main__":
    main()
