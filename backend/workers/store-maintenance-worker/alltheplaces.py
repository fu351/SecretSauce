from __future__ import annotations

import io
import os

import ijson
import requests


DEFAULT_OUTPUT_BASES = (
    "https://data.alltheplaces.xyz/runs/latest/output",
    "https://alltheplaces-data.openaddresses.io/runs/latest/output",
)

# Known spider aliases in case a *_us name is missing from a particular run.
SPIDER_ALIASES: dict[str, list[str]] = {
    "aldi_us": ["aldi"],
    "kroger_us": ["kroger"],
    "meijer_us": ["meijer"],
    "target_us": ["target"],
    "walmart_us": ["walmart"],
    "trader_joes_us": ["trader_joes"],
    "99_ranch_market_us": ["99_ranch_market"],
    "whole_foods": ["whole_foods_us"],
    # Instacart-backed store aliases
    "sams_club": ["sams_club_us"],
    "bjs_wholesale_club": ["bjs_wholesale_club_us", "bjs"],
    "stop_and_shop": ["stop_and_shop_us"],
    "food_lion": ["food_lion_us"],
    "winn_dixie": ["winn_dixie_us"],
}


def get_output_bases() -> list[str]:
    """Return primary/fallback AllThePlaces output bases."""
    configured = [os.environ.get("ALLTHEPLACES_OUTPUT_BASE")]
    configured.extend(DEFAULT_OUTPUT_BASES)
    return [base.rstrip("/") for base in configured if base]


def build_spider_candidates(
    spider_name: str,
    spider_aliases: dict[str, list[str]] | None = None,
) -> list[str]:
    """Return spider-name candidates in priority order, deduped."""
    aliases = spider_aliases or SPIDER_ALIASES
    candidates: list[str] = [spider_name]
    candidates.extend(aliases.get(spider_name, []))

    if spider_name.endswith("_us"):
        candidates.append(spider_name[:-3])
    else:
        candidates.append(f"{spider_name}_us")

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        cleaned = candidate.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped


def fetch_features_with_fallback(
    session: requests.Session,
    spider_name: str,
    timeout: int = 120,
    output_bases: list[str] | None = None,
    spider_aliases: dict[str, list[str]] | None = None,
):
    """
    Fetch GeoJSON features trying multiple spider aliases and base URLs.
    Raises RequestException only after all candidates are exhausted.
    """
    bases = output_bases or get_output_bases()
    attempted_urls: list[str] = []
    status_by_url: list[tuple[str, int]] = []
    request_errors: list[tuple[str, str]] = []

    for candidate in build_spider_candidates(spider_name, spider_aliases):
        for base_url in bases:
            url = f"{base_url}/{candidate}.geojson"
            attempted_urls.append(url)
            try:
                with session.get(url, timeout=timeout) as response:
                    if response.status_code != 200:
                        status_by_url.append((url, response.status_code))
                        continue
                    features = ijson.items(io.BytesIO(response.content), "features.item")
                    return candidate, url, features
            except requests.exceptions.RequestException as error:
                request_errors.append((url, f"{type(error).__name__}: {error}"))
                continue

    attempted = "\n".join(f"      - {url}" for url in attempted_urls)
    status_lines = "\n".join(f"      - {url} -> HTTP {status}" for url, status in status_by_url)
    request_error_lines = "\n".join(f"      - {url} -> {message}" for url, message in request_errors)
    details = [
        f"Unable to fetch spider '{spider_name}'. URLs attempted:",
        attempted,
    ]
    if status_lines:
        details.extend(["HTTP results:", status_lines])
    if request_error_lines:
        details.extend(["Request errors:", request_error_lines])
    raise requests.exceptions.RequestException("\n".join(details))
