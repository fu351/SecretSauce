import os
import ijson
import requests
from supabase import create_client, Client

# 1. Setup
URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
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

def fix_missing_geometry():
    print("🔍 Querying database for stores missing geometry...")
    
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

    # Group work by brand to minimize large file downloads
    queue = {}
    for item in missing_data:
        brand = item['store_enum']
        if brand not in queue:
            queue[brand] = []
        queue[brand].append(item)

    for brand_enum, stores in queue.items():
        spider = ENUM_TO_SPIDER.get(brand_enum)
        if not spider:
            print(f"⚠️ No spider mapped for brand enum: {brand_enum}")
            continue

        print(f"📂 Processing spider '{spider}' for {len(stores)} missing points...")
        url = f"https://data.alltheplaces.xyz/runs/latest/output/{spider}.geojson"
        
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

                    # Look for a match in our local sub-queue for this brand
                    for store in stores:
                        db_zip = str(store.get('zip_code', '')).split('-')[0].strip()

                        if db_zip and db_zip == osm_zip:
                            coords = feature.get('geometry', {}).get('coordinates')
                            if coords and len(coords) == 2:
                                print(f"   🎯 Match! {store['name']} in {db_zip}")
                                
                                # Update the row with the found coordinates
                                # Supabase expects EWKT format for geography: 'POINT(lon lat)'
                                supabase.table("grocery_stores").update({
                                    "geom": f"POINT({coords[0]} {coords[1]})"
                                }).eq("id", store['id']).execute()
                                
                                # Optimization: remove from current brand list once found
                                stores.remove(store)
                                break

        except Exception as e:
            print(f"   ❌ Error processing {spider}: {e}")

if __name__ == "__main__":
    fix_missing_geometry()