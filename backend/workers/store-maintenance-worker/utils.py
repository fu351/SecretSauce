"""Shared utilities for the store-maintenance worker."""

from __future__ import annotations

import os
from typing import Iterable

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ─── Brand / spider mapping ───────────────────────────────────────────────────

ENUM_TO_SPIDER: dict[str, str] = {
    "aldi": "aldi_us",
    "kroger": "kroger_us",
    "safeway": "safeway",
    "meijer": "meijer_us",
    "target": "target_us",
    "traderjoes": "trader_joes_us",
    "99ranch": "99_ranch_market_us",
    "walmart": "walmart_us",
    "wholefoods": "whole_foods",
}


# ─── Env / arg parsing ────────────────────────────────────────────────────────

def parse_token_set(values: Iterable[str] | None) -> set[str]:
    """Expand comma/space-separated tokens into a normalized set."""
    expanded: list[str] = []
    for raw in values or []:
        if not raw:
            continue
        for part in str(raw).replace(",", " ").split():
            candidate = part.strip()
            if candidate:
                expanded.append(candidate)
    return set(expanded)


def parse_bool(value: str | bool | None, default: bool = False) -> bool:
    """Parse common truthy/falsy string values."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def gather_brand_filter_from_args(brand_args: list[str] | None = None) -> set[str] | None:
    """
    Gather brand filter from CLI arguments and the BRAND_FILTER env var.
    Returns a set of brand enum strings, or None if no filter is specified.
    """
    raw_values: list[str] = []
    if brand_args:
        raw_values.extend(brand_args)
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


def apply_brand_filter(query, brand_filter: set[str] | None):
    """Apply a brand filter to a Supabase query."""
    if not brand_filter:
        return query
    return query.in_("store_enum", list(brand_filter))


# ─── HTTP ─────────────────────────────────────────────────────────────────────

def create_retry_session(retries: int = 3, backoff_factor: int = 1) -> requests.Session:
    """
    Create a requests.Session with retry logic for transient failures.
    Retries on 5xx/429 with exponential backoff.
    """
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


# ─── Store record helpers ─────────────────────────────────────────────────────

def build_store_key(store_enum: str, name: str, zip_code: str, address: str = None) -> str:
    """Return a dedup key in the format ``brand:name:zip``."""
    normalized_name = name.lower().strip() if name else ""
    normalized_zip = str(zip_code).split("-")[0].strip() if zip_code else ""
    return f"{store_enum}:{normalized_name}:{normalized_zip}"


def parse_store_from_feature(feature: dict, brand_enum: str) -> dict | None:
    """Parse a GeoJSON feature into a store record ready for insertion."""
    props = feature.get("properties", {})
    name = props.get("name", props.get("brand", ""))
    raw_zip = str(props.get("addr:postcode", props.get("postcode", "")))
    zip_code = raw_zip.split("-")[0].strip()
    if not name or not zip_code:
        return None
    coords = feature.get("geometry", {}).get("coordinates")
    if not coords or len(coords) != 2:
        return None
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
    return {
        "store_enum": brand_enum,
        "name": name,
        "address": street_address,
        "city": city or None,
        "state": state or None,
        "zip_code": zip_code,
        "geom": f"POINT({coords[0]} {coords[1]})",
        "failure_count": 0,
    }


# ─── Statistics ───────────────────────────────────────────────────────────────

def create_stats_dict() -> dict[str, int]:
    """Return a fresh statistics dictionary for tracking scraper progress."""
    return {
        "new_stores": 0,
        "duplicates_skipped": 0,
        "no_geometry": 0,
        "wrong_zipcode": 0,
        "errors": 0,
    }


def print_stats_summary(stats: dict[str, int], target_zipcodes: set[str] | None = None) -> None:
    """Print a formatted scraper statistics summary."""
    print(f"\n{'=' * 60}")
    print("📊 SCRAPE COMPLETE")
    print(f"{'=' * 60}")
    if target_zipcodes:
        print(f"   Target ZIP codes:       {len(target_zipcodes)}")
    print(f"   New stores added:       {stats['new_stores']}")
    print(f"   Duplicates skipped:     {stats['duplicates_skipped']}")
    print(f"   No geometry (skipped):  {stats['no_geometry']}")
    if target_zipcodes or stats.get("wrong_zipcode", 0) > 0:
        print(f"   Wrong ZIP code:         {stats['wrong_zipcode']}")
    print(f"   Errors:                 {stats['errors']}")
    print(f"{'=' * 60}\n")
