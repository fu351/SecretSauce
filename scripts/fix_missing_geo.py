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
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")
supabase: Client = create_client(URL, KEY)

# Rate limiting configuration
DELAY_BETWEEN_SPIDERS = 5  # seconds between processing different spiders
DELAY_AFTER_ERROR = 15     # seconds to wait after server errors before continuing
DELAY_BETWEEN_GEOCODE = 0.5  # seconds between Google Maps API calls

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

def create_retry_session(retries=3, backoff_factor=1):
    """
    Create a requests session with retry logic for transient failures.
    Automatically retries on server errors (5xx) with exponential backoff.
    """
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def geocode_zip_code(zip_code: str, session: requests.Session = None) -> dict | None:
    """
    Geocode a ZIP code using Google Maps Geocoding API with retry logic.
    Returns coordinates as {lat, lng} or None if failed.
    """
    if not GOOGLE_MAPS_API_KEY:
        print("⚠️  No GOOGLE_MAPS_API_KEY found. Skipping ZIP centroid fallback.")
        return None

    # Create retry session if not provided
    if session is None:
        session = create_retry_session(retries=3, backoff_factor=2)

    try:
        # Add small delay to avoid hitting Google Maps API rate limits
        time.sleep(DELAY_BETWEEN_GEOCODE)

        url = f"https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            "address": zip_code,
            "key": GOOGLE_MAPS_API_KEY
        }
        response = session.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("status") == "OK" and len(data.get("results", [])) > 0:
            location = data["results"][0]["geometry"]["location"]
            return {
                "lat": location["lat"],
                "lng": location["lng"]
            }
        else:
            print(f"   ⚠️  Google Geocoding API returned status: {data.get('status')}")
            return None
    except requests.exceptions.HTTPError as e:
        print(f"   ❌ HTTP error geocoding ZIP {zip_code}: {e.response.status_code}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Network error geocoding ZIP {zip_code}: {e}")
        return None
    except Exception as e:
        print(f"   ❌ Unexpected error geocoding ZIP {zip_code}: {e}")
        return None

def fix_missing_geometry():
    print("🔍 Querying database for stores missing geometry...")

    # Statistics tracking
    stats = {
        "all_the_places": 0,
        "centroid_upgrades": 0,  # Centroids upgraded to precise locations
        "zip_fallback": 0,
        "failed": 0
    }

    # Check how many stores are being skipped due to high failure counts
    # Includes both NULL geometry and stores with centroids
    skipped_response = supabase.table("grocery_stores") \
        .select("id", count="exact") \
        .or_("geom.is.null,address.like.*centroid*") \
        .gte("failure_count", 3) \
        .execute()

    skipped_count = skipped_response.count or 0
    if skipped_count > 0:
        print(f"⏭️  Skipping {skipped_count} stores with 3+ failed attempts")

    # We pull the id (to update), store_enum (to match brand),
    # zip_code (the primary lookup key), failure_count, and address
    # Process stores with NULL geometry OR centroid addresses (to try upgrading)
    # Only process stores that haven't failed 3+ times
    response = supabase.table("grocery_stores") \
        .select("id, store_enum, zip_code, name, failure_count, address") \
        .or_("geom.is.null,address.like.*centroid*") \
        .lt("failure_count", 3) \
        .execute()

    missing_data = response.data
    if not missing_data:
        if skipped_count > 0:
            print(f"✅ No stores to process ({skipped_count} permanently skipped)")
        else:
            print("✅ No missing geometry found. Database is healthy!")
        return

    print(f"📊 Found {len(missing_data)} stores missing geometry")

    # Group work by brand to minimize large file downloads
    queue = {}
    for item in missing_data:
        brand = item['store_enum']
        if brand not in queue:
            queue[brand] = []
        queue[brand].append(item)

    # Track updates to batch them
    batch_updates = []

    # Track stores by their status for failure_count updates
    failed_store_ids = set()  # Complete failures (no location at all)
    centroid_store_ids = set()  # Stores that end up with/keep centroids
    stores_with_existing_centroids = set()  # Track which stores already had centroids

    # Identify stores that already have centroids
    for item in missing_data:
        if item.get('address') and 'centroid' in item.get('address', '').lower():
            stores_with_existing_centroids.add(item['id'])

    # Track which iteration we're on for rate limiting
    spider_count = 0
    total_spiders = len(queue)

    for brand_enum, stores in queue.items():
        spider_count += 1
        spider = ENUM_TO_SPIDER.get(brand_enum)
        if not spider:
            print(f"⚠️ No spider mapped for brand enum: {brand_enum}")
            continue

        print(f"📂 Processing spider '{spider}' for {len(stores)} missing points...")
        url = f"https://data.alltheplaces.xyz/runs/latest/output/{spider}.geojson"

        # Create a dictionary for O(1) lookup by ZIP code
        stores_by_zip = {}
        for store in stores:
            db_zip = str(store.get('zip_code', '')).split('-')[0].strip()
            if db_zip:
                if db_zip not in stores_by_zip:
                    stores_by_zip[db_zip] = []
                stores_by_zip[db_zip].append(store)

        try:
            # Create session with retry logic for transient failures
            session = create_retry_session(retries=3, backoff_factor=1)

            # Fetch GeoJSON with automatic gzip decompression
            with session.get(url, timeout=120) as r:
                r.raise_for_status()
                # r.content auto-decompresses gzip, io.BytesIO provides file-like interface
                features = ijson.items(io.BytesIO(r.content), 'features.item')

                for feature in features:
                    props = feature.get('properties', {})
                    # Standardize the ZIP from the GeoJSON (remove +4 suffix if present)
                    raw_zip = str(props.get('addr:postcode', props.get('postcode', '')))
                    osm_zip = raw_zip.split('-')[0].strip()

                    # O(1) lookup instead of nested loop
                    if osm_zip in stores_by_zip:
                        coords = feature.get('geometry', {}).get('coordinates')
                        if coords and len(coords) == 2:
                            # Match the first unmatched store in this ZIP
                            for store in stores_by_zip[osm_zip]:
                                # Check if this is upgrading a centroid
                                was_centroid = store['id'] in stores_with_existing_centroids
                                upgrade_msg = " (upgraded from centroid)" if was_centroid else ""
                                print(f"   🎯 Match! {store['name']} in {osm_zip}{upgrade_msg}")

                                # Queue the update instead of executing immediately
                                batch_updates.append({
                                    "id": store['id'],
                                    "geom": f"POINT({coords[0]} {coords[1]})"
                                })

                                if was_centroid:
                                    stats["centroid_upgrades"] += 1
                                else:
                                    stats["all_the_places"] += 1

                                # Remove from the lookup dict
                                stores_by_zip[osm_zip].remove(store)
                                if not stores_by_zip[osm_zip]:
                                    del stores_by_zip[osm_zip]
                                break

        except requests.exceptions.HTTPError as e:
            if e.response.status_code >= 500:
                print(f"   ❌ Server error {e.response.status_code} for {spider} - retries exhausted")
                print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing to let server recover...")
                time.sleep(DELAY_AFTER_ERROR)
            else:
                print(f"   ❌ HTTP error {e.response.status_code}: {e}")
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error processing {spider}: {e}")
            # Network errors often indicate server overload, wait before continuing
            print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing...")
            time.sleep(DELAY_AFTER_ERROR)
        except Exception as e:
            print(f"   ❌ Unexpected error processing {spider}: {type(e).__name__}: {e}")

        # Rebuild stores list from remaining unmatched stores
        queue[brand_enum] = [store for zip_stores in stores_by_zip.values() for store in zip_stores]

        # Add delay between spiders to avoid overwhelming the server
        if spider_count < total_spiders:
            print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s before next spider... ({spider_count}/{total_spiders})")
            time.sleep(DELAY_BETWEEN_SPIDERS)

    # ============================================================================
    # ZIP CENTROID FALLBACK
    # For stores that weren't found in All the Places, use ZIP code centroid
    # ============================================================================
    print(f"\n📍 Starting ZIP centroid fallback for remaining stores...")

    # Create retry session for Google Maps API calls
    geocode_session = create_retry_session(retries=3, backoff_factor=2)

    # Cache for geocoded ZIP codes to avoid duplicate API calls
    zip_cache = {}

    # Collect all unique ZIP codes and check for conflicts in batch
    all_zip_codes = set()
    for brand_enum, stores in queue.items():
        for store in stores:
            zip_code = store.get('zip_code')
            if zip_code:
                all_zip_codes.add(zip_code)

    # Query conflicts for all brands at once
    conflict_markers = set()
    if all_zip_codes:
        for brand_enum in queue.keys():
            conflict_response = supabase.table("grocery_stores") \
                .select("address, zip_code, store_enum") \
                .eq("store_enum", brand_enum) \
                .like("address", "ZIP % (centroid)") \
                .execute()

            for row in conflict_response.data:
                conflict_markers.add((row['store_enum'], row['zip_code'], row['address']))

    for brand_enum, stores in queue.items():
        if not stores:
            continue  # All stores for this brand were already matched

        print(f"   Processing {len(stores)} remaining {brand_enum} stores via ZIP geocoding")

        for store in stores:
            zip_code = store.get('zip_code')
            store_id = store['id']
            already_has_centroid = store_id in stores_with_existing_centroids

            if not zip_code:
                print(f"   ⚠️  Store {store['id']} has no ZIP code, skipping")
                stats["failed"] += 1
                failed_store_ids.add(store_id)
                continue

            # If store already has a centroid and wasn't upgraded, just track for failure increment
            if already_has_centroid:
                print(f"   ⏭️  {store['name']} in {zip_code} → keeping existing centroid (no upgrade found)")
                centroid_store_ids.add(store_id)
                continue

            # For new centroids, geocode the ZIP
            if zip_code not in zip_cache:
                zip_cache[zip_code] = geocode_zip_code(zip_code, session=geocode_session)

            coords = zip_cache[zip_code]

            if coords:
                # Update store with ZIP centroid, mark address as approximate
                address_marker = f"ZIP {zip_code} (centroid)"
                update_payload = {
                    "geom": f"POINT({coords['lng']} {coords['lat']})"
                }

                # Check if this marker is already in use (using our pre-fetched conflicts)
                conflict_key = (brand_enum, zip_code, address_marker)
                if conflict_key not in conflict_markers:
                    update_payload["address"] = address_marker
                    # Add to conflict markers to prevent duplicate address assignments
                    conflict_markers.add(conflict_key)
                else:
                    print(f"   ⚠️  Skipping address update for {store['name']} ({zip_code}) because the marker is already in use")

                batch_updates.append({
                    "id": store_id,
                    **update_payload
                })

                print(f"   📌 {store['name']} in {zip_code} → ZIP centroid")
                stats["zip_fallback"] += 1
                # Track this store for failure_count increment (using centroid, not precise location)
                centroid_store_ids.add(store_id)
            else:
                print(f"   ❌ Failed to geocode ZIP {zip_code} for {store['name']}")
                stats["failed"] += 1
                failed_store_ids.add(store_id)

    # ============================================================================
    # FINAL BATCH UPDATE
    # ============================================================================
    if batch_updates:
        print(f"\n💾 Executing {len(batch_updates)} final batched updates...")
        for update in batch_updates:
            store_id = update.pop("id")
            supabase.table("grocery_stores").update(update).eq("id", store_id).execute()

    # ============================================================================
    # INCREMENT FAILURE COUNT FOR STORES WITHOUT PRECISE LOCATIONS
    # ============================================================================
    # Combine failed stores and stores that used/kept centroids
    stores_to_increment = failed_store_ids | centroid_store_ids

    if stores_to_increment:
        print(f"\n📈 Incrementing failure_count for {len(stores_to_increment)} stores:")
        if failed_store_ids:
            print(f"   • {len(failed_store_ids)} complete failures")
        if centroid_store_ids:
            print(f"   • {len(centroid_store_ids)} using/keeping centroid locations")

        # Batch increment using PostgreSQL function
        # This requires the increment_geocoding_failures function to exist in the database
        try:
            result = supabase.rpc('increment_geocoding_failures', {
                'store_ids': list(stores_to_increment)
            }).execute()

            # Check if any stores hit the 3-failure threshold
            if result.data:
                for store_id in result.data:
                    print(f"   ⚠️  Store {store_id} has reached maximum failure count (3) and will be skipped in future runs")
        except Exception as e:
            print(f"   ⚠️  Could not increment failure counts: {e}")
            print(f"   ℹ️  Make sure the increment_geocoding_failures function exists in your database")

    # ============================================================================
    # FINAL STATISTICS
    # ============================================================================
    print(f"\n{'='*60}")
    print(f"📊 ENRICHMENT COMPLETE")
    print(f"{'='*60}")
    print(f"   All the Places matches: {stats['all_the_places']}")
    print(f"   Centroid upgrades:      {stats['centroid_upgrades']}")
    print(f"   ZIP centroid fallback:  {stats['zip_fallback']}")
    print(f"   Failed to geocode:      {stats['failed']}")
    total_precise = stats['all_the_places'] + stats['centroid_upgrades']
    total_processed = total_precise + stats['zip_fallback'] + stats['failed']
    print(f"   Total processed:        {total_processed} ({total_precise} precise locations)")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    fix_missing_geometry()
