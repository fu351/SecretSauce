#!/usr/bin/env python3
"""
Backfill city/state and geography for scraped ZIP codes using Zippopotam.

This runs against the `scraped_zipcodes` tracking table and updates rows
missing either a centroid or the city/state name. It uses the public
https://api.zippopotam.us/us/{ZIP} endpoint so no API key is required.

Run with:
    python scripts/backfill_scraped_zipcodes.py
    python scripts/backfill_scraped_zipcodes.py --loop
"""

from __future__ import annotations

import argparse
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

import requests
from requests import Response
from supabase import Client

from scraper_common import create_retry_session, get_supabase_client

ZIPPOTAM_BASE_URL = "https://api.zippopotam.us/us"


def gather_missing_zipcodes(supabase: Client, limit: int) -> list[dict]:
    """
    Retrieve ZIP codes that still need city/state or geography populating.
    """
    query = supabase.table("scraped_zipcodes") \
        .select("zip_code, city, state, latitude, longitude, geom") \
        .or_("geom.is.null,city.is.null") \
        .limit(limit)

    response = query.execute()
    return response.data or []


thread_local = threading.local()


def _get_worker_session() -> requests.Session:
    """
    Provide a retry-enabled requests.Session per worker thread.
    """
    session = getattr(thread_local, "session", None)
    if session is None:
        session = create_retry_session(retries=3, backoff_factor=2)
        thread_local.session = session
    return session


def fetch_zip_metadata(zip_code: str, session: requests.Session | None = None) -> dict | None:
    """
    Call Zippopotam for the ZIP centroid and city/state.
    """
    url = f"{ZIPPOTAM_BASE_URL}/{zip_code}"
    session = session or create_retry_session(retries=3, backoff_factor=2)
    try:
        resp: Response = session.get(url, timeout=15)
        if resp.status_code != 200:
            print(f"   ⚠️  {zip_code} → HTTP {resp.status_code}; skipping")
            return None

        data = resp.json()
        places = data.get("places")
        if not places:
            print(f"   ⚠️  {zip_code} → no places returned")
            return None

        place = places[0]
        latitude = float(place.get("latitude"))
        longitude = float(place.get("longitude"))
        return {
            "city": place.get("place name"),
            "state": place.get("state abbreviation"),
            "latitude": latitude,
            "longitude": longitude,
            "geom": f"POINT({longitude} {latitude})"
        }
    except (requests.RequestException, ValueError) as exc:
        print(f"   ❌ {zip_code} → {type(exc).__name__}: {exc}")
        return None


def update_zipcode(
    supabase: Client,
    zip_code: str,
    payload: dict,
    dry_run: bool = False
) -> bool:
    """
    Persist the backfilled metadata (or print in dry-run mode).
    """
    if dry_run:
        print(f"   💡 [dry run] Would update {zip_code} with {payload}")
        return True

    supabase.table("scraped_zipcodes").update({
        **payload,
        "updated_at": "now()"
    }).eq("zip_code", zip_code).execute()
    print(f"   ✅ {zip_code} updated")
    return True


def process_batch(
    supabase: Client,
    rows: Iterable[dict],
    delay: float,
    dry_run: bool,
    concurrency: int,
) -> int:
    """
    Fetch and apply metadata for a batch of ZIP codes using parallel requests.
    """
    processed = 0
    zip_codes = [row["zip_code"] for row in rows if row.get("zip_code")]
    if not zip_codes:
        return 0

    workers = min(concurrency, len(zip_codes))

    def fetch_worker(zip_code: str) -> tuple[str, dict | None]:
        print(f"🔎 Processing {zip_code}...")
        metadata = fetch_zip_metadata(zip_code, session=_get_worker_session())
        if metadata:
            time.sleep(delay)
        return zip_code, metadata

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_worker, zip_code): zip_code for zip_code in zip_codes}
        for future in as_completed(futures):
            zip_code, metadata = future.result()
            if metadata:
                update_zipcode(supabase, zip_code, metadata, dry_run=dry_run)
                processed += 1

    return processed


def run_backfill(
    limit: int,
    delay: float,
    dry_run: bool,
    loop: bool,
    max_batches: int | None,
    concurrency: int,
) -> None:
    """
    Drive the backfill process, optionally looping until the table is healthy.
    """
    supabase = get_supabase_client()
    batch_number = 0
    total_processed = 0

    while True:
        batch_number += 1
        rows = gather_missing_zipcodes(supabase, limit)
        if not rows:
            if batch_number == 1:
                print("✅ All ZIP codes already have metadata.")
            else:
                print("✅ No additional ZIP codes left to backfill.")
            break

        print(f"\n📦 Batch {batch_number}: processing {len(rows)} ZIP codes")
        processed = process_batch(supabase, rows, delay, dry_run, concurrency)
        total_processed += processed

        if not loop:
            break

        if max_batches and batch_number >= max_batches:
            print("⚠️  Reached --max-batches limit; stop looping")
            break

        print("⏳ Sleeping briefly before next batch...")
        time.sleep(1)

    print(f"\n📊 Total ZIP codes updated: {total_processed}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill scraped_zipcodes metadata from Zippopotam")
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=100,
        help="How many ZIP codes to fetch per batch (default: 100)"
    )
    parser.add_argument(
        "--delay",
        "-d",
        type=float,
        default=0.1,
        help="Seconds to wait between each API call (default: 0.1)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print the updates without writing to the database"
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Keep fetching new batches until no rows remain"
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=0,
        help="When used with --loop, stop after this many batches (0 = unlimited)"
    )
    parser.add_argument(
        "--concurrency",
        "-c",
        type=int,
        default=10,
        help="Number of ZIP metadata requests to run in parallel (default: 10)"
    )
    return parser.parse_args()


def main():
    args = _parse_args()
    max_batches = args.max_batches if args.max_batches > 0 else None
    concurrency = max(1, args.concurrency)
    run_backfill(
        limit=args.limit,
        delay=args.delay,
        dry_run=args.dry_run,
        loop=args.loop,
        max_batches=max_batches,
        concurrency=concurrency,
    )


if __name__ == "__main__":
    main()
