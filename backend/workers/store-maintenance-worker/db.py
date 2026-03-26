"""Database operations for the store-maintenance worker."""

from __future__ import annotations

import os
from typing import Iterable

from supabase import Client, create_client

from .utils import build_store_key


def get_supabase_client() -> Client:
    """Initialize a Supabase client from environment variables."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def fetch_existing_store_keys(
    supabase: Client,
    brands: Iterable[str],
    target_zipcodes: set[str] | None = None,
) -> tuple[set[str], set[tuple[str, str]]]:
    """
    Pre-load existing store keys to avoid duplicates on insert.

    Returns:
        (existing_store_keys, existing_null_address_pairs)
    """
    existing_keys: set[str] = set()
    existing_null_address: set[tuple[str, str]] = set()

    for brand in brands:
        query = (
            supabase.table("grocery_stores")
            .select("store_enum, name, zip_code, address")
            .eq("store_enum", brand)
        )
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


def record_inserted_zips(records: list[dict], zips_with_stores: dict[str, int]) -> None:
    """Update the ZIP tracking dict with newly inserted store records."""
    for record in records:
        zip_code = record.get("zip_code")
        if not zip_code:
            continue
        zips_with_stores[zip_code] = zips_with_stores.get(zip_code, 0) + 1


def insert_store_batch(
    supabase: Client,
    batch: list[dict],
    zips_with_stores: dict[str, int],
    stats: dict[str, int],
    dry_run: bool = False,
) -> None:
    """Insert a batch of stores, updating stats and ZIP tracking."""
    if dry_run:
        print(f"   💡 Dry run – would insert {len(batch)} stores")
    else:
        supabase.table("grocery_stores").insert(batch).execute()
        print(f"   ✅ Inserted {len(batch)} stores")
    stats["new_stores"] += len(batch)
    record_inserted_zips(batch, zips_with_stores)


def update_scraped_zipcodes(supabase: Client, zips_with_stores: dict[str, int]) -> None:
    """Upsert ZIP code rows in the scraped_zipcodes tracking table."""
    if not zips_with_stores:
        return
    print("\n📝 Updating scraped_zipcodes table...")
    try:
        for zip_code, count in zips_with_stores.items():
            supabase.table("scraped_zipcodes").upsert({
                "zip_code": zip_code,
                "last_scraped_at": "now()",
                "store_count": count,
                "updated_at": "now()",
            }).execute()
        print(f"   ✅ Tracked {len(zips_with_stores)} ZIP codes")
    except Exception as e:
        print(f"   ⚠️  Could not update scraped ZIP codes tracking: {e}")


def mark_scraping_events_completed(zip_codes: set[str]) -> int:
    """Mark scraping_events rows as completed for the given ZIP set."""
    if not zip_codes:
        return 0
    supabase = get_supabase_client()
    for zip_code in sorted(zip_codes):
        supabase.table("scraping_events").update({"status": "completed"}).eq(
            "zip_code", zip_code
        ).eq("status", "processing").execute()
    return len(zip_codes)
