import argparse
import os
import io
import time
import ijson
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from supabase import create_client, Client

# 1. Setup
URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(URL, KEY)

# Rate limiting configuration
DELAY_BETWEEN_SPIDERS = 15  # seconds between processing different spiders (increased for API health)
DELAY_AFTER_ERROR = 60     # seconds to wait after server errors before continuing (longer recovery time)

# Batch processing configuration
MAX_SPIDERS_PER_RUN = int(os.environ.get("MAX_SPIDERS_PER_RUN", "0")) or None  # None = no limit

# Mapping your Enum values to the All the Places Spider names
ENUM_TO_SPIDER = {
    "aldi": "aldi",
    "kroger": "kroger",
    "safeway": "safeway",
    "meijer": "meijer",
    "target": "target_us",
    "traderjoes": "trader_joes_us",
    "99ranch": "99_ranch_market",
    "walmart": "walmart_us",
    "wholefoods": "whole_foods_market"
}


def apply_brand_filter(query, brand_filter: set[str] | None):
    if not brand_filter:
        return query
    return query.in_("store_enum", list(brand_filter))


def create_retry_session(retries=3, backoff_factor=1):
    """
    Create a requests session with retry logic for transient failures.
    Automatically retries on server errors (5xx) with exponential backoff.

    Example: With retries=3 and backoff_factor=3:
      - 1st retry after 3s
      - 2nd retry after 6s
      - 3rd retry after 12s
    """
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False  # Let us handle errors manually for better logging
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def build_store_key(store_enum: str, name: str, zip_code: str, address: str = None) -> str:
    """
    Create a unique key for a store to check if it already exists.
    Uses store_enum + name + zip_code as the composite key.
    """
    # Normalize name (lowercase, strip whitespace)
    normalized_name = name.lower().strip() if name else ""
    normalized_zip = str(zip_code).split('-')[0].strip() if zip_code else ""

    return f"{store_enum}:{normalized_name}:{normalized_zip}"


def import_new_stores(brand_filter: set[str] | None = None, use_target_zipcodes: bool = True):
    print("🔍 Starting store import from All the Places...")
    if brand_filter:
        print(f"   🔖 Brand filter applied: {', '.join(sorted(brand_filter))}")

    # Load target ZIP codes if enabled
    target_zipcodes = None
    if use_target_zipcodes:
        print("🎯 Loading target ZIP codes (user locations + neighbors)...")
        try:
            # Get ZIP codes that haven't been scraped yet or need refresh (>30 days old)
            target_query = supabase.table("target_zipcodes") \
                .select("zip_code, priority, user_count") \
                .order("priority", desc=True)

            target_response = target_query.execute()
            target_zipcodes = set(row['zip_code'] for row in target_response.data)

            if not target_zipcodes:
                print("   ⚠️  No target ZIP codes found!")
                print("   💡 Run: python scripts/update_target_zipcodes.py")
                return

            print(f"   📍 Targeting {len(target_zipcodes)} ZIP codes based on user locations")

            # Show top priorities
            top_zips = target_response.data[:5]
            print(f"   🔝 Top priority ZIPs:")
            for zip_data in top_zips:
                print(f"      {zip_data['zip_code']}: {zip_data['user_count']} users")

        except Exception as e:
            print(f"   ⚠️  Could not load target ZIP codes: {e}")
            print(f"   ℹ️  Make sure to run the migration: scripts/migrations/create_scraped_zipcodes_table.sql")
            print(f"   ℹ️  Proceeding without ZIP filtering (will scrape all stores)")
            target_zipcodes = None

    # Statistics tracking
    stats = {
        "new_stores": 0,
        "duplicates_skipped": 0,
        "no_geometry": 0,
        "wrong_zipcode": 0,  # Stores not in target ZIP codes
        "errors": 0
    }

    zips_with_stores: dict[str, int] = {}

    def record_inserted_zips(records: list[dict]):
        for record in records:
            zip_code = record.get("zip_code")
            if not zip_code:
                continue
            zips_with_stores[zip_code] = zips_with_stores.get(zip_code, 0) + 1

    # Determine which brands to process
    brands_to_process = brand_filter if brand_filter else set(ENUM_TO_SPIDER.keys())

    # Limit brands if MAX_SPIDERS_PER_RUN is set
    if MAX_SPIDERS_PER_RUN and len(brands_to_process) > MAX_SPIDERS_PER_RUN:
        brands_to_process = set(list(brands_to_process)[:MAX_SPIDERS_PER_RUN])
        print(f"⚙️  MAX_SPIDERS_PER_RUN={MAX_SPIDERS_PER_RUN}: Processing {len(brands_to_process)} brands")

    # Fetch existing stores for each brand to check for duplicates
    # Build a set of existing store keys for O(1) lookup
    existing_stores = set()

    print(f"\n📊 Fetching existing stores from database...")
    for brand_enum in brands_to_process:
        # Fetch all stores for this brand to check for duplicates
        response = supabase.table("grocery_stores") \
            .select("store_enum, name, zip_code") \
            .eq("store_enum", brand_enum) \
            .execute()

        for store in response.data:
            key = build_store_key(
                store['store_enum'],
                store.get('name', ''),
                store.get('zip_code', '')
            )
            existing_stores.add(key)

    print(f"   Found {len(existing_stores)} existing stores across {len(brands_to_process)} brands")

    # Track stores to insert in batches
    stores_to_insert = []
    BATCH_SIZE = 100  # Insert in batches of 100

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
        url = f"https://data.alltheplaces.xyz/runs/latest/output/{spider}.geojson"
        print(f"   URL: {url}")

        try:
            # Create session with retry logic for transient failures
            # Higher backoff_factor to avoid hammering struggling servers
            session = create_retry_session(retries=3, backoff_factor=3)

            # Fetch GeoJSON with automatic gzip decompression
            # Note: We use r.content instead of streaming because ijson with r.raw
            # doesn't auto-decompress gzip. Since we're filtering by ZIP code,
            # we process far fewer stores even though we download the full file.
            with session.get(url, timeout=120) as r:
                r.raise_for_status()
                # r.content auto-decompresses gzip, io.BytesIO provides file-like interface
                features = ijson.items(io.BytesIO(r.content), 'features.item')

                store_count = 0
                for feature in features:
                    props = feature.get('properties', {})

                    # Extract store information
                    name = props.get('name', props.get('brand', ''))
                    raw_zip = str(props.get('addr:postcode', props.get('postcode', '')))
                    zip_code = raw_zip.split('-')[0].strip()

                    # Skip if no name or zip
                    if not name or not zip_code:
                        continue

                    # Filter by target ZIP codes if enabled
                    if target_zipcodes and zip_code not in target_zipcodes:
                        stats["wrong_zipcode"] += 1
                        continue

                    # Check if store already exists
                    store_key = build_store_key(brand_enum, name, zip_code)
                    if store_key in existing_stores:
                        stats["duplicates_skipped"] += 1
                        continue

                    # Extract geometry
                    coords = feature.get('geometry', {}).get('coordinates')
                    if not coords or len(coords) != 2:
                        stats["no_geometry"] += 1
                        continue

                    # Extract address components
                    street = props.get('addr:street', props.get('street', ''))
                    housenumber = props.get('addr:housenumber', props.get('housenumber', ''))
                    city = props.get('addr:city', props.get('city', ''))
                    state = props.get('addr:state', props.get('state', ''))

                    # Build street address (without city/state)
                    address_parts = []
                    if housenumber and street:
                        address_parts.append(f"{housenumber} {street}")
                    elif street:
                        address_parts.append(street)

                    street_address = ', '.join(filter(None, address_parts)) if address_parts else None

                    # Prepare store record with separate city and state columns
                    store_record = {
                        "store_enum": brand_enum,
                        "name": name,
                        "address": street_address,  # Just street address
                        "city": city or None,
                        "state": state or None,
                        "zip_code": zip_code,
                        "geom": f"POINT({coords[0]} {coords[1]})",
                        "failure_count": 0
                    }

                    stores_to_insert.append(store_record)
                    existing_stores.add(store_key)  # Add to set to prevent duplicates within this run
                    store_count += 1

                    # Insert in batches to avoid large transactions
                    if len(stores_to_insert) >= BATCH_SIZE:
                        batch = stores_to_insert
                        supabase.table("grocery_stores").insert(batch).execute()
                        stats["new_stores"] += len(batch)
                        record_inserted_zips(batch)
                        print(f"   ✅ Inserted batch of {len(batch)} stores")
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
            batch = stores_to_insert
            supabase.table("grocery_stores").insert(batch).execute()
            stats["new_stores"] += len(batch)
            record_inserted_zips(batch)
            print(f"\n✅ Inserted final batch of {len(batch)} stores")
            stores_to_insert = []
        except Exception as e:
            print(f"\n❌ Error inserting final batch: {e}")
            stats["errors"] += 1

    # ============================================================================
    # UPDATE SCRAPED ZIP CODES TRACKING
    # ============================================================================
    if target_zipcodes and use_target_zipcodes:
        print(f"\n📝 Updating scraped ZIP codes tracking...")
        try:
            # Update scraped_zipcodes table
            for zip_code, count in zips_with_stores.items():
                supabase.table("scraped_zipcodes").upsert({
                    "zip_code": zip_code,
                    "last_scraped_at": "now()",
                    "store_count": count,
                    "updated_at": "now()"
                }).execute()

            print(f"   ✅ Tracked {len(zips_with_stores)} scraped ZIP codes")

        except Exception as e:
            print(f"   ⚠️  Could not update scraped ZIP codes tracking: {e}")

    # ============================================================================
    # FINAL STATISTICS
    # ============================================================================
    print(f"\n{'='*60}")
    print(f"📊 IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"   New stores added:       {stats['new_stores']}")
    print(f"   Duplicates skipped:     {stats['duplicates_skipped']}")
    print(f"   No geometry (skipped):  {stats['no_geometry']}")
    if target_zipcodes:
        print(f"   Wrong ZIP code:         {stats['wrong_zipcode']} (not in target ZIPs)")
    print(f"   Errors:                 {stats['errors']}")
    print(f"{'='*60}\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import new grocery stores from All the Places.")
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
    raw_values: list[str] = []
    raw_values.extend(args.brand or [])
    env_value = os.environ.get("BRAND_FILTER")
    if env_value:
        raw_values.append(env_value)

    expanded: list[str] = []
    for raw in raw_values:
        if not raw:
            continue
        # Replace commas with spaces so we can split on whitespace cleanly
        for part in raw.replace(",", " ").split():
            candidate = part.strip()
            if candidate:
                expanded.append(candidate)

    return set(expanded) if expanded else None


if __name__ == "__main__":
    args = _parse_args()
    brand_filter = _gather_brand_filter(args)
    use_target_zipcodes = not args.all_zipcodes  # Default to True, unless --all-zipcodes flag is set
    import_new_stores(brand_filter, use_target_zipcodes)
