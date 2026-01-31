import os
import ijson
import requests
from supabase import create_client, Client

# 1. Setup
URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(URL, KEY)

# Map DB Enums back to Spider Names
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

def fix_missing_geography():
    # 1. Fetch stores missing geom
    print("🔍 Checking for stores missing geography data...")
    response = supabase.table("grocery_stores").select("*").is_("geom", "null").execute()
    missing_stores = response.data

    if not missing_stores:
        print("✅ No stores missing geography. Exiting.")
        return

    # Group missing stores by brand to minimize spider downloads
    brands_to_fix = {}
    for store in missing_stores:
        enum = store['store_enum']
        if enum not in brands_to_fix:
            brands_to_fix[enum] = []
        brands_to_fix[enum].append(store)

    for enum, stores in brands_to_fix.items():
        spider = ENUM_TO_SPIDER.get(enum)
        if not spider: continue

        print(f"📂 Processing {spider} for {len(stores)} missing locations...")
        url = f"https://data.alltheplaces.xyz/runs/latest/output/{spider}.geojson"
        
        try:
            r = requests.get(url, stream=True, timeout=120)
            features = ijson.items(r.raw, 'features.item')

            for feature in features:
                props = feature.get('properties', {})
                # Normalize address for matching
                osm_addr = f"{props.get('addr:housenumber', '')} {props.get('addr:street', '')}".strip().lower()
                
                for store in stores:
                    db_addr = (store.get('address') or "").lower()
                    
                    # If addresses match, update the geography
                    if db_addr and db_addr == osm_addr:
                        coords = feature.get('geometry', {}).get('coordinates')
                        if coords:
                            print(f"   🎯 Match Found! Updating {store['name']} at {store['address']}")
                            supabase.table("grocery_stores").update({
                                "geom": f"POINT({coords[0]} {coords[1]})"
                            }).eq("id", store['id']).execute()
                            
        except Exception as e:
            print(f"   ❌ Error processing {spider}: {e}")

if __name__ == "__main__":
    fix_missing_geography()