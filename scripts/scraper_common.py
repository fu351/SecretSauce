"""
Common utilities and functions shared between import_new_stores.py and geoscraper.py.

This module provides:
- Supabase client initialization
- Brand/spider mappings
- HTTP retry session configuration
- Store key building and validation
- Feature parsing and store record creation
- Database operations (batch insert, zipcode tracking)
"""

from __future__ import annotations

import os
from typing import Iterable

import requests
from requests.adapters import HTTPAdapter
from supabase import Client, create_client
from urllib3.util.retry import Retry

# ============================================================================
# SUPABASE CLIENT INITIALIZATION
# ============================================================================

def get_supabase_client() -> Client:
    """Initialize and return a Supabase client using environment variables."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


# ============================================================================
# CONSTANTS
# ============================================================================

# Mapping your Enum values to the All the Places Spider names
ENUM_TO_SPIDER = {
    "aldi": "aldi_us",
    "kroger": "kroger_us",
    "safeway": "safeway",
    "meijer": "meijer_us",
    "target": "target_us",
    "traderjoes": "trader_joes_us",
    "99ranch": "99_ranch_market_us",
    "walmart": "walmart_us",
    "wholefoods": "whole_foods"
}

# Batch processing configuration
DEFAULT_BATCH_SIZE = 5


# ============================================================================
# HTTP SESSION UTILITIES
# ============================================================================

def create_retry_session(retries: int = 3, backoff_factor: int = 1) -> requests.Session:
    """
    Create a requests session with retry logic for transient failures.
    Automatically retries on server errors (5xx) with exponential backoff.

    Args:
        retries: Number of retry attempts
        backoff_factor: Multiplier for exponential backoff (in seconds)

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


# ============================================================================
# STORE KEY BUILDING
# ============================================================================

def build_store_key(store_enum: str, name: str, zip_code: str, address: str = None) -> str:
    """
    Create a unique key for a store to check if it already exists.
    Uses store_enum + name + zip_code as the composite key.

    Args:
        store_enum: The brand enum (e.g., 'aldi', 'kroger')
        name: Store name
        zip_code: ZIP code
        address: Optional address (not used in key, kept for compatibility)

    Returns:
        A unique key string in the format "brand:name:zip"
    """
    # Normalize name (lowercase, strip whitespace)
    normalized_name = name.lower().strip() if name else ""
    normalized_zip = str(zip_code).split('-')[0].strip() if zip_code else ""

    return f"{store_enum}:{normalized_name}:{normalized_zip}"


# ============================================================================
# BRAND FILTERING
# ============================================================================

def gather_brand_filter_from_args(brand_args: list[str] | None = None) -> set[str] | None:
    """
    Gather brand filter from CLI arguments and environment variables.

    Args:
        brand_args: List of brand strings from argparse (can contain comma-separated values)

    Returns:
        Set of brand enum strings, or None if no filter specified
    """
    raw_values: list[str] = []

    # Add CLI arguments
    if brand_args:
        raw_values.extend(brand_args)

    # Add environment variable
    env_value = os.environ.get("BRAND_FILTER")
    if env_value:
        raw_values.append(env_value)

    # Expand comma/space-separated values
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


def apply_brand_filter(query, brand_filter: set[str] | None):
    """
    Apply brand filter to a Supabase query.

    Args:
        query: Supabase query object
        brand_filter: Set of brand enums to filter by, or None for no filter

    Returns:
        Modified query with brand filter applied
    """
    if not brand_filter:
        return query
    return query.in_("store_enum", list(brand_filter))


# ============================================================================
# FEATURE PARSING
# ============================================================================

def parse_store_from_feature(feature: dict, brand_enum: str) -> dict | None:
    """
    Parse a GeoJSON feature into a store record.

    Args:
        feature: GeoJSON feature dict from All the Places
        brand_enum: The brand enum for this store

    Returns:
        Store record dict ready for database insertion, or None if invalid
    """
    props = feature.get("properties", {})

    # Extract basic info
    name = props.get("name", props.get("brand", ""))
    raw_zip = str(props.get("addr:postcode", props.get("postcode", "")))
    zip_code = raw_zip.split("-")[0].strip()

    # Skip if no name or zip
    if not name or not zip_code:
        return None

    # Extract geometry
    coords = feature.get("geometry", {}).get("coordinates")
    if not coords or len(coords) != 2:
        return None

    # Extract address components
    street = props.get("addr:street", props.get("street", ""))
    housenumber = props.get("addr:housenumber", props.get("housenumber", ""))
    city = props.get("addr:city", props.get("city", ""))
    state = props.get("addr:state", props.get("state", ""))

    # Build street address (without city/state)
    address_parts = []
    if housenumber and street:
        address_parts.append(f"{housenumber} {street}")
    elif street:
        address_parts.append(street)

    street_address = ", ".join(filter(None, address_parts)) if address_parts else None

    # Build store record
    return {
        "store_enum": brand_enum,
        "name": name,
        "address": street_address,
        "city": city or None,
        "state": state or None,
        "zip_code": zip_code,
        "geom": f"POINT({coords[0]} {coords[1]})",
        "failure_count": 0
    }


# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

def fetch_existing_store_keys(
    supabase: Client,
    brands: Iterable[str],
    target_zipcodes: set[str] | None = None
) -> tuple[set[str], set[tuple[str, str]]]:
    """
    Pre-load existing store keys to avoid duplicates.

    Args:
        supabase: Supabase client instance
        brands: Brand enums to fetch stores for
        target_zipcodes: Optional set of ZIP codes to limit query

    Returns:
        Tuple of (existing_store_keys, existing_null_address_pairs)
    """
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
                store.get("zip_code", "")
            )
            existing_keys.add(key)

            # Track stores with null addresses to enforce unique constraint
            if not store.get("address"):
                existing_null_address.add((store["store_enum"], store.get("zip_code") or ""))

    return existing_keys, existing_null_address


def record_inserted_zips(records: list[dict], zips_with_stores: dict[str, int]) -> None:
    """
    Update the ZIP code tracking dictionary with newly inserted stores.

    Args:
        records: List of store records that were inserted
        zips_with_stores: Dictionary mapping ZIP codes to store counts
    """
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
    dry_run: bool = False
) -> None:
    """
    Insert a batch of stores into the database.

    Args:
        supabase: Supabase client instance
        batch: List of store records to insert
        zips_with_stores: Dictionary to track ZIP codes with stores
        stats: Statistics dictionary to update
        dry_run: If True, only print what would be inserted
    """
    if dry_run:
        print(f"   💡 Dry run – would insert {len(batch)} stores")
    else:
        supabase.table("grocery_stores").insert(batch).execute()
        print(f"   ✅ Inserted {len(batch)} stores")

    stats["new_stores"] += len(batch)
    record_inserted_zips(batch, zips_with_stores)


def update_scraped_zipcodes(supabase: Client, zips_with_stores: dict[str, int]) -> None:
    """
    Update the scraped_zipcodes tracking table.

    Args:
        supabase: Supabase client instance
        zips_with_stores: Dictionary mapping ZIP codes to store counts
    """
    if not zips_with_stores:
        return

    print("\n📝 Updating scraped_zipcodes table...")
    try:
        for zip_code, count in zips_with_stores.items():
            supabase.table("scraped_zipcodes").upsert({
                "zip_code": zip_code,
                "last_scraped_at": "now()",
                "store_count": count,
                "updated_at": "now()"
            }).execute()

        print(f"   ✅ Tracked {len(zips_with_stores)} ZIP codes")

    except Exception as e:
        print(f"   ⚠️  Could not update scraped ZIP codes tracking: {e}")


# ============================================================================
# STATISTICS INITIALIZATION
# ============================================================================

def create_stats_dict() -> dict[str, int]:
    """Create a standardized statistics dictionary for tracking scraper progress."""
    return {
        "new_stores": 0,
        "duplicates_skipped": 0,
        "no_geometry": 0,
        "wrong_zipcode": 0,
        "errors": 0
    }


def print_stats_summary(stats: dict[str, int], target_zipcodes: set[str] | None = None) -> None:
    """
    Print a formatted summary of scraper statistics.

    Args:
        stats: Statistics dictionary
        target_zipcodes: Optional set of target ZIP codes (for contextual info)
    """
    print(f"\n{'='*60}")
    print(f"📊 SCRAPE COMPLETE")
    print(f"{'='*60}")
    if target_zipcodes:
        print(f"   Target ZIP codes:       {len(target_zipcodes)}")
    print(f"   New stores added:       {stats['new_stores']}")
    print(f"   Duplicates skipped:     {stats['duplicates_skipped']}")
    print(f"   No geometry (skipped):  {stats['no_geometry']}")
    if target_zipcodes or stats.get('wrong_zipcode', 0) > 0:
        print(f"   Wrong ZIP code:         {stats['wrong_zipcode']}")
    print(f"   Errors:                 {stats['errors']}")
    print(f"{'='*60}\n")
