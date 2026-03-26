"""Fill in missing or approximate geometry for grocery store records."""

from __future__ import annotations

import argparse
import os
import time

import ijson
import requests
from supabase import Client

from .db import get_supabase_client
from .utils import apply_brand_filter, create_retry_session, gather_brand_filter_from_args

# Rate limiting
DELAY_BETWEEN_SPIDERS = 15
DELAY_AFTER_ERROR = 60
DELAY_BETWEEN_GEOCODE = 0.5

# Batch processing
MAX_SPIDERS_PER_RUN = int(os.environ.get("MAX_SPIDERS_PER_RUN", "0")) or None
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")

# Direct spider names (no _us suffix) used for bare URL construction in this module.
# These differ from ENUM_TO_SPIDER in utils.py which uses the canonical _us names
# consumed by alltheplaces.fetch_features_with_fallback.
_ENUM_TO_SPIDER: dict[str, str] = {
    "aldi": "aldi",
    "kroger": "kroger",
    "safeway": "safeway",
    "meijer": "meijer",
    "target": "target_us",
    "traderjoes": "trader_joes_us",
    "99ranch": "99_ranch_market",
    "walmart": "walmart_us",
    "wholefoods": "whole_foods_market",
}

supabase: Client = get_supabase_client()


def geocode_zip_code(zip_code: str, session: requests.Session | None = None) -> dict | None:
    """Geocode a ZIP code via Google Maps; returns {lat, lng} or None."""
    if not GOOGLE_MAPS_API_KEY:
        print("⚠️  No GOOGLE_MAPS_API_KEY found. Skipping ZIP centroid fallback.")
        return None
    if session is None:
        session = create_retry_session(retries=3, backoff_factor=2)
    try:
        time.sleep(DELAY_BETWEEN_GEOCODE)
        response = session.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": zip_code, "key": GOOGLE_MAPS_API_KEY},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("status") == "OK" and data.get("results"):
            location = data["results"][0]["geometry"]["location"]
            return {"lat": location["lat"], "lng": location["lng"]}
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


def fix_missing_geometry(brand_filter: set[str] | None = None) -> None:
    print("🔍 Querying database for stores missing geometry...")
    if brand_filter:
        print(f"   🔖 Brand filter applied: {', '.join(sorted(brand_filter))}")

    stats = {
        "all_the_places": 0,
        "centroid_upgrades": 0,
        "zip_fallback": 0,
        "failed": 0,
    }

    skipped_query = (
        supabase.table("grocery_stores")
        .select("id", count="exact")
        .or_("geom.is.null,address.like.*centroid*")
        .gte("failure_count", 3)
    )
    skipped_response = apply_brand_filter(skipped_query, brand_filter).execute()
    skipped_count = skipped_response.count or 0
    if skipped_count > 0:
        print(f"⏭️  Skipping {skipped_count} stores with 3+ failed attempts")

    missing_query = (
        supabase.table("grocery_stores")
        .select("id, store_enum, zip_code, name, failure_count, address")
        .or_("geom.is.null,address.like.*centroid*")
        .lt("failure_count", 3)
    )
    response = apply_brand_filter(missing_query, brand_filter).execute()
    missing_data = response.data

    if not missing_data:
        if skipped_count > 0:
            print(f"✅ No stores to process ({skipped_count} permanently skipped)")
        else:
            print("✅ No missing geometry found. Database is healthy!")
        return

    print(f"📊 Found {len(missing_data)} stores missing geometry")

    queue: dict[str, list[dict]] = {}
    for item in missing_data:
        brand = item["store_enum"]
        queue.setdefault(brand, []).append(item)

    if MAX_SPIDERS_PER_RUN and len(queue) > MAX_SPIDERS_PER_RUN:
        sorted_brands = sorted(queue.items(), key=lambda x: len(x[1]), reverse=True)
        queue = dict(sorted_brands[:MAX_SPIDERS_PER_RUN])
        skipped_brands = len(sorted_brands) - MAX_SPIDERS_PER_RUN
        skipped_stores = sum(len(s) for _, s in sorted_brands[MAX_SPIDERS_PER_RUN:])
        print(f"⚙️  MAX_SPIDERS_PER_RUN={MAX_SPIDERS_PER_RUN}: Processing {len(queue)} brands")
        print(f"   Skipping {skipped_brands} brands ({skipped_stores} stores) for this run")

    batch_updates: list[dict] = []
    failed_store_ids: set[int] = set()
    centroid_store_ids: set[int] = set()
    stores_with_existing_centroids = {
        item["id"]
        for item in missing_data
        if item.get("address") and "centroid" in item.get("address", "").lower()
    }

    spider_count = 0
    total_spiders = len(queue)

    for brand_enum, stores in queue.items():
        spider_count += 1
        spider = _ENUM_TO_SPIDER.get(brand_enum)
        if not spider:
            print(f"⚠️ No spider mapped for brand enum: {brand_enum}")
            continue

        url = f"https://data.alltheplaces.xyz/runs/latest/output/{spider}.geojson"
        print(f"\n📂 [{spider_count}/{total_spiders}] Processing spider '{spider}' for {len(stores)} missing points...")
        print(f"   URL: {url}")

        stores_by_zip: dict[str, list[dict]] = {}
        for store in stores:
            db_zip = str(store.get("zip_code", "")).split("-")[0].strip()
            if db_zip:
                stores_by_zip.setdefault(db_zip, []).append(store)

        try:
            session = create_retry_session(retries=3, backoff_factor=3)
            with session.get(url, stream=True, timeout=120) as r:
                r.raise_for_status()
                features = ijson.items(r.raw, "features.item")
                for feature in features:
                    props = feature.get("properties", {})
                    raw_zip = str(props.get("addr:postcode", props.get("postcode", "")))
                    osm_zip = raw_zip.split("-")[0].strip()
                    if osm_zip in stores_by_zip:
                        coords = feature.get("geometry", {}).get("coordinates")
                        if coords and len(coords) == 2:
                            for store in stores_by_zip[osm_zip]:
                                was_centroid = store["id"] in stores_with_existing_centroids
                                upgrade_msg = " (upgraded from centroid)" if was_centroid else ""
                                print(f"   🎯 Match! {store['name']} in {osm_zip}{upgrade_msg}")
                                batch_updates.append({"id": store["id"], "geom": f"POINT({coords[0]} {coords[1]})"})
                                if was_centroid:
                                    stats["centroid_upgrades"] += 1
                                else:
                                    stats["all_the_places"] += 1
                                stores_by_zip[osm_zip].remove(store)
                                if not stores_by_zip[osm_zip]:
                                    del stores_by_zip[osm_zip]
                                break

        except requests.exceptions.HTTPError as e:
            if e.response.status_code >= 500:
                print(f"   ❌ Server error {e.response.status_code} for {spider} - retries exhausted")
                print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing...")
                time.sleep(DELAY_AFTER_ERROR)
            else:
                print(f"   ❌ HTTP error {e.response.status_code}: {e}")
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error processing {spider}: {e}")
            print(f"   ⏳ Waiting {DELAY_AFTER_ERROR}s before continuing...")
            time.sleep(DELAY_AFTER_ERROR)
        except Exception as e:
            print(f"   ❌ Unexpected error processing {spider}: {type(e).__name__}: {e}")

        queue[brand_enum] = [s for zip_stores in stores_by_zip.values() for s in zip_stores]

        if spider_count < total_spiders:
            print(f"   ⏳ Waiting {DELAY_BETWEEN_SPIDERS}s before next spider... ({spider_count}/{total_spiders})")
            time.sleep(DELAY_BETWEEN_SPIDERS)

    # ─── ZIP centroid fallback ────────────────────────────────────────────────
    print("\n📍 Starting ZIP centroid fallback for remaining stores...")
    geocode_session = create_retry_session(retries=3, backoff_factor=2)
    zip_cache: dict[str, dict | None] = {}

    all_zip_codes = {
        store.get("zip_code")
        for stores in queue.values()
        for store in stores
        if store.get("zip_code")
    }
    conflict_markers: set[tuple[str, str, str]] = set()
    if all_zip_codes:
        for brand_enum in queue:
            conflict_response = (
                supabase.table("grocery_stores")
                .select("address, zip_code, store_enum")
                .eq("store_enum", brand_enum)
                .like("address", "ZIP % (centroid)")
                .execute()
            )
            for row in conflict_response.data:
                conflict_markers.add((row["store_enum"], row["zip_code"], row["address"]))

    for brand_enum, stores in queue.items():
        if not stores:
            continue
        print(f"   Processing {len(stores)} remaining {brand_enum} stores via ZIP geocoding")
        for store in stores:
            zip_code = store.get("zip_code")
            store_id = store["id"]
            already_has_centroid = store_id in stores_with_existing_centroids

            if not zip_code:
                print(f"   ⚠️  Store {store_id} has no ZIP code, skipping")
                stats["failed"] += 1
                failed_store_ids.add(store_id)
                continue

            if already_has_centroid:
                print(f"   ⏭️  {store['name']} in {zip_code} → keeping existing centroid")
                centroid_store_ids.add(store_id)
                continue

            if zip_code not in zip_cache:
                zip_cache[zip_code] = geocode_zip_code(zip_code, session=geocode_session)
            coords = zip_cache[zip_code]

            if coords:
                address_marker = f"ZIP {zip_code} (centroid)"
                update_payload: dict = {"geom": f"POINT({coords['lng']} {coords['lat']})"}
                conflict_key = (brand_enum, zip_code, address_marker)
                if conflict_key not in conflict_markers:
                    update_payload["address"] = address_marker
                    conflict_markers.add(conflict_key)
                else:
                    print(f"   ⚠️  Skipping address update for {store['name']} ({zip_code}): marker already in use")
                batch_updates.append({"id": store_id, **update_payload})
                print(f"   📌 {store['name']} in {zip_code} → ZIP centroid")
                stats["zip_fallback"] += 1
                centroid_store_ids.add(store_id)
            else:
                print(f"   ❌ Failed to geocode ZIP {zip_code} for {store['name']}")
                stats["failed"] += 1
                failed_store_ids.add(store_id)

    # ─── Final batch update ───────────────────────────────────────────────────
    if batch_updates:
        print(f"\n💾 Executing {len(batch_updates)} final batched updates...")
        for update in batch_updates:
            store_id = update.pop("id")
            supabase.table("grocery_stores").update(update).eq("id", store_id).execute()

    stores_to_increment = failed_store_ids | centroid_store_ids
    if stores_to_increment:
        print(f"\n📈 Incrementing failure_count for {len(stores_to_increment)} stores:")
        if failed_store_ids:
            print(f"   • {len(failed_store_ids)} complete failures")
        if centroid_store_ids:
            print(f"   • {len(centroid_store_ids)} using/keeping centroid locations")
        try:
            result = supabase.rpc("increment_geocoding_failures", {"store_ids": list(stores_to_increment)}).execute()
            if result.data:
                for store_id in result.data:
                    print(f"   ⚠️  Store {store_id} reached maximum failure count and will be skipped in future runs")
        except Exception as e:
            print(f"   ⚠️  Could not increment failure counts: {e}")

    print(f"\n{'=' * 60}")
    print("📊 ENRICHMENT COMPLETE")
    print(f"{'=' * 60}")
    print(f"   All the Places matches: {stats['all_the_places']}")
    print(f"   Centroid upgrades:      {stats['centroid_upgrades']}")
    print(f"   ZIP centroid fallback:  {stats['zip_fallback']}")
    print(f"   Failed to geocode:      {stats['failed']}")
    total_precise = stats["all_the_places"] + stats["centroid_upgrades"]
    total_processed = total_precise + stats["zip_fallback"] + stats["failed"]
    print(f"   Total processed:        {total_processed} ({total_precise} precise locations)")
    print(f"{'=' * 60}\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fill in missing grocery store geometry.")
    parser.add_argument("--brand", "-b", action="append",
                        help="Limit to specific store_enum values (repeatable; comma/space-separated).")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    brand_filter = gather_brand_filter_from_args(args.brand or [])
    fix_missing_geometry(brand_filter)


if __name__ == "__main__":
    main()
