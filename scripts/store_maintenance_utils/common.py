from __future__ import annotations

import os
from typing import Iterable


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
    """Parse common workflow bool values like 'true'/'false'."""
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


def mark_scraping_events_completed(zip_codes: set[str]) -> int:
    """Mark scraping_events rows as completed for a ZIP set."""
    if not zip_codes:
        return 0

    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    supabase = create_client(url, key)
    for zip_code in sorted(zip_codes):
        supabase.table("scraping_events").update({"status": "completed"}).eq(
            "zip_code", zip_code
        ).eq("status", "processing").execute()
    return len(zip_codes)
