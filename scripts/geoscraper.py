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
from typing import Iterable

import ijson
import requests
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry

from scripts.import_new_stores import ENUM_TO_SPIDER, build_store_key

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(URL, KEY)

# Rate limiting (keep low for real-time to stay responsive)
DELAY_BETWEEN_SPIDERS = 10
MAX_BATCH_SIZE = 100


def create_retry_session(retries=3, backoff_factor=1):
    """Copy of the helper in import_new_stores to keep retry behavior consistent."""
    session = requests.Session()
    session.mount("http://", HTTPAdapter(max_retries=Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )))
    session.mount("https://", HTTPAdapter(max_retries=Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )))
    return session


def gather_zipcodes_from_args(args: argparse.Namespace) -> set[str]:
    """Collect ZIP codes from CLI, comma-separated strings, or an env var."""
    raw_values: list[str] = []
    raw_values.extend(args.zip or [])
    if args.zipcodes:
        raw_values.extend(args.zipcodes.replace(",", " ").split())

    env_values = os.environ.get(args.env_zip_var or "REALTIME_TARGET_ZIPCODES")
    if env_values:
        raw_values.extend(env_values.replace(",", " ").split())

    zoned = {value.strip() for value in raw_values if value and value.strip()}
    return zoned


def gather_brand_filter(args: argparse.Namespace) -> set[str] | None:
    raw_values: list[str] = []
    raw_values.extend(args.brand or [])
    env_value = os.environ.get("BRAND_FILTER")
    if env_value:
        raw_values.append(env_value)

    expanded: list[str] = []
    for raw in raw_values:
        if not raw:
            continue
        for part in raw.replace(",", " ").split():
            candidate = part.strip()
            if candidate:
                expanded.append(candidate)

    return set(expanded) if expanded else None


def fetch_existing_store_keys(brands: Iterable[str], target_zipcodes: set[str]):
    """Pre-load existing store keys (and null-address pairs) to avoid duplicates."""
    existing_keys: set[str] = set()
    existing_null_address: set[tuple[str, str]] = set()

    for brand in brands:
        query = supabase.table("grocery_stores") \
            .select("store_enum, name, zip_code, address") \
            .eq("store_enum", brand)

        if target_zipcodes:
            query = query.in_("zip_code", list(target_zipcodes))

        response = query.execute()
        for store in response.data:
            key = build_store_key(
                store["store_enum"],
                store.get("name", ""),
                store.get("zip_code", ""),
            )
            existing_keys.add(key)
            if not store.get("address"):
                existing_null_address.add((store["store_enum"], store.get("zip_code") or ""))

    return existing_keys, existing_null_address


def record_inserted_zips(records: list[dict], zips_with_stores: dict[str, int]):
    for record in records:
        zip_code = record.get("zip_code")
        if not zip_code:
            continue
        zips_with_stores[zip_code] = zips_with_stores.get(zip_code, 0) + 1


def run_geoscraper(target_zipcodes: set[str], brand_filter: set[str] | None, *,
                   dry_run: bool = False):
    if not target_zipcodes:
        print("⚠️  No ZIP codes provided. Provide --zip/-z or set REALTIME_TARGET_ZIPCODES.")
        return

    brands_to_process = brand_filter if brand_filter else set(ENUM_TO_SPIDER.keys())
    stats = {
        "new_stores": 0,
        "duplicates_skipped": 0,
        "no_geometry": 0,
        "wrong_zipcode": 0,
        "errors": 0,
    }

    zips_with_stores: dict[str, int] = {}
    existing_stores, existing_null_address_pairs = fetch_existing_store_keys(
        brands_to_process, target_zipcodes
    )

    stores_to_insert: list[dict] = []
    spider_count = 0
    total_spiders = len(brands_to_process)

    print(f"🔍 Real-time scrape for {len(target_zipcodes)} ZIP codes across {total_spiders} brands")

    for brand_enum in brands_to_process:
        spider_count += 1
        spider_name = ENUM_TO_SPIDER.get(brand_enum)
        if not spider_name:
            print(f"⚠️  No spider mapped for {brand_enum}; skipping")
            continue

        print(f"\n📂 [{spider_count}/{total_spiders}] {brand_enum} → {spider_name}")
        url = f"https://data.alltheplaces.xyz/runs/latest/output/{spider_name}.geojson"
        print(f"   URL: {url}")

        try:
            session = create_retry_session(retries=3, backoff_factor=2)
            with session.get(url, timeout=90) as r:
                r.raise_for_status()
                features = ijson.items(io.BytesIO(r.content), "features.item")
                store_count = 0

                for feature in features:
                    props = feature.get("properties", {})
                    name = props.get("name", props.get("brand", ""))
                    raw_zip = str(props.get("addr:postcode", props.get("postcode", "")))
                    zip_code = raw_zip.split("-")[0].strip()

                    if not name or not zip_code:
                        continue

                    if zip_code not in target_zipcodes:
                        stats["wrong_zipcode"] += 1
                        continue

                    store_key = build_store_key(brand_enum, name, zip_code)
                    if store_key in existing_stores:
                        stats["duplicates_skipped"] += 1
                        continue

                    coords = feature.get("geometry", {}).get("coordinates")
                    if not coords or len(coords) != 2:
                        stats["no_geometry"] += 1
                        continue

                    street = props.get("addr:street", props.get("street", ""))
                    housenumber = props.get("addr:housenumber", props.get("housenumber", ""))
                    city = props.get("addr:city", props.get("city", ""))
                    state = props.get("addr:state", props.get("state", ""))

                    address_parts = []
                    if housenumber and street:
                        address_parts.append(f"{housenumber} {street}")
                    elif street:
                        address_parts.append(street)

                    street_address = ", ".join(filter(None, address_parts)) if address_parts else None
                    null_address_pair = (brand_enum, zip_code)
                    if not street_address and null_address_pair in existing_null_address_pairs:
                        stats["duplicates_skipped"] += 1
                        continue

                    if not street_address:
                        existing_null_address_pairs.add(null_address_pair)

                    store_record = {
                        "store_enum": brand_enum,
                        "name": name,
                        "address": street_address,
                        "city": city or None,
                        "state": state or None,
                        "zip_code": zip_code,
                        "geom": f"POINT({coords[0]} {coords[1]})",
                        "failure_count": 0,
                    }

                    stores_to_insert.append(store_record)
                    existing_stores.add(store_key)
                    store_count += 1

                    if len(stores_to_insert) >= MAX_BATCH_SIZE:
                        insert_batch(stores_to_insert, zips_with_stores, stats, dry_run)
                        stores_to_insert = []

                print(f"   📊 Matched {store_count} stores in target ZIPs")

        except requests.exceptions.HTTPError as e:
            stats["errors"] += 1
            print(f"   ❌ HTTP {e.response.status_code} for {spider_name}: {e}")
            if e.response.status_code >= 500:
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
        insert_batch(stores_to_insert, zips_with_stores, stats, dry_run)

    if not dry_run and zips_with_stores:
        update_scraped_zipcodes(zips_with_stores)

    print("\n" + "=" * 60)
    print("🛰️  Geoscraper run complete")
    print("=" * 60)
    print(f"   Target ZIP codes:       {len(target_zipcodes)}")
    print(f"   New stores added:       {stats['new_stores']}")
    print(f"   Duplicates skipped:     {stats['duplicates_skipped']}")
    print(f"   Wrong ZIPs filtered:    {stats['wrong_zipcode']}")
    print(f"   No geometry:            {stats['no_geometry']}")
    print(f"   Errors:                 {stats['errors']}")
    print("=" * 60 + "\n")


def insert_batch(batch: list[dict], zips_with_stores: dict[str, int],
                 stats: dict[str, int], dry_run: bool):
    if dry_run:
        print(f"   💡 Dry run – would insert {len(batch)} stores")
    else:
        supabase.table("grocery_stores").insert(batch).execute()
        print(f"   ✅ Inserted {len(batch)} stores")

    stats["new_stores"] += len(batch)
    record_inserted_zips(batch, zips_with_stores)


def update_scraped_zipcodes(zips_with_stores: dict[str, int]):
    print("\n📝 Updating scraped_zipcodes table...")
    for zip_code, count in zips_with_stores.items():
        supabase.table("scraped_zipcodes").upsert({
            "zip_code": zip_code,
            "last_scraped_at": "now()",
            "store_count": count,
            "updated_at": "now()"
        }).execute()

    print(f"   ✅ Tracked {len(zips_with_stores)} ZIP codes")


def main():
    parser = argparse.ArgumentParser(
        description="Real-time scraper triggered for specific ZIP codes."
    )
    parser.add_argument(
        "--zip",
        "-z",
        action="append",
        help="Target ZIP code to include (can be repeated)."
    )
    parser.add_argument(
        "--zipcodes",
        help="Comma or space-separated list of ZIP codes (legacy)."
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

    brand_filter = gather_brand_filter(args)
    run_geoscraper(target_zipcodes, brand_filter, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
