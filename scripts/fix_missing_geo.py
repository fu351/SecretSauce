import os
import ijson
import requests
from supabase import create_client, Client

# 1. Setup
URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")
supabase: Client = create_client(URL, KEY)

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

def geocode_zip_code(zip_code: str) -> dict | None:
    """
    Geocode a ZIP code using Google Maps Geocoding API.
    Returns coordinates as {lat, lng} or None if failed.
    """
    if not GOOGLE_MAPS_API_KEY:
        print("⚠️  No GOOGLE_MAPS_API_KEY found. Skipping ZIP centroid fallback.")
        return None

    try:
        url = f"https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            "address": zip_code,
            "key": GOOGLE_MAPS_API_KEY
        }
        response = requests.get(url, params=params, timeout=10)
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
    except Exception as e:
        print(f"   ❌ Error geocoding ZIP {zip_code}: {e}")
        return None

def fix_missing_geometry():
    print("🔍 Querying database for stores missing geometry...")

    # Statistics tracking
    stats = {
        "all_the_places": 0,
        "zip_fallback": 0,
        "failed": 0
    }

    # We pull the id (to update), store_enum (to match brand),
    # and zip_code (the primary lookup key)
    response = supabase.table("grocery_stores") \
        .select("id, store_enum, zip_code, name") \
        .is_("geom", "null") \
        .execute()

    missing_data = response.data
    if not missing_data:
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

    for brand_enum, stores in queue.items():
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
            # We stream the file to keep RAM usage low on GitHub Actions
            with requests.get(url, stream=True, timeout=120) as r:
                r.raise_for_status()
                # Parse the 'features' array one by one
                features = ijson.items(r.raw, 'features.item')

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
                                print(f"   🎯 Match! {store['name']} in {osm_zip}")

                                # Queue the update instead of executing immediately
                                batch_updates.append({
                                    "id": store['id'],
                                    "geom": f"POINT({coords[0]} {coords[1]})"
                                })

                                stats["all_the_places"] += 1

                                # Remove from the lookup dict
                                stores_by_zip[osm_zip].remove(store)
                                if not stores_by_zip[osm_zip]:
                                    del stores_by_zip[osm_zip]
                                break

        except Exception as e:
            print(f"   ❌ Error processing {spider}: {e}")

        # Rebuild stores list from remaining unmatched stores
        queue[brand_enum] = [store for zip_stores in stores_by_zip.values() for store in zip_stores]

    # ============================================================================
    # ZIP CENTROID FALLBACK
    # For stores that weren't found in All the Places, use ZIP code centroid
    # ============================================================================
    print(f"\n📍 Starting ZIP centroid fallback for remaining stores...")

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
            if not zip_code:
                print(f"   ⚠️  Store {store['id']} has no ZIP code, skipping")
                stats["failed"] += 1
                continue

            # Check cache first
            if zip_code not in zip_cache:
                zip_cache[zip_code] = geocode_zip_code(zip_code)

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
                    "id": store['id'],
                    **update_payload
                })

                print(f"   📌 {store['name']} in {zip_code} → ZIP centroid")
                stats["zip_fallback"] += 1
            else:
                print(f"   ❌ Failed to geocode ZIP {zip_code} for {store['name']}")
                stats["failed"] += 1

    # ============================================================================
    # FINAL BATCH UPDATE
    # ============================================================================
    if batch_updates:
        print(f"\n💾 Executing {len(batch_updates)} final batched updates...")
        for update in batch_updates:
            store_id = update.pop("id")
            supabase.table("grocery_stores").update(update).eq("id", store_id).execute()

    # ============================================================================
    # FINAL STATISTICS
    # ============================================================================
    print(f"\n{'='*60}")
    print(f"📊 ENRICHMENT COMPLETE")
    print(f"{'='*60}")
    print(f"   All the Places matches: {stats['all_the_places']}")
    print(f"   ZIP centroid fallback:  {stats['zip_fallback']}")
    print(f"   Failed to geocode:      {stats['failed']}")
    print(f"   Total processed:        {stats['all_the_places'] + stats['zip_fallback'] + stats['failed']}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    fix_missing_geometry()
