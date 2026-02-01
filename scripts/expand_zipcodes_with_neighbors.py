#!/usr/bin/env python3
"""
Expand a list of ZIP codes by adding neighboring ZIP codes (numeric proximity).

This script is designed to be used in GitHub Actions workflows to expand
the set of ZIP codes to scrape. It takes a small list of "seed" ZIP codes,
adds neighboring ZIPs using the database function, and outputs the complete
list for downstream processing.

Usage:
    python scripts/expand_zipcodes_with_neighbors.py --zips "94102,10001"
    python scripts/expand_zipcodes_with_neighbors.py --zips "94102,10001" --radius 10
    python scripts/expand_zipcodes_with_neighbors.py --zips "94102" --radius 5 --cleanup
"""

from __future__ import annotations

import argparse
import os
import sys
from supabase import create_client, Client


def expand_zipcodes_with_neighbors(
    input_zipcodes: list[str],
    radius: int = 5,
    cleanup: bool = False,
    skip_existing: bool = True
) -> list[str]:
    """
    Expand a list of ZIP codes by adding neighboring ZIP codes.

    Args:
        input_zipcodes: Original ZIP codes to expand
        radius: Number of neighboring ZIPs to add on each side (default: 5)
        cleanup: If True, remove temporary entries after getting results
        skip_existing: If True, filter out ZIPs that already exist in scraped_zipcodes (default: True)

    Returns:
        List of all ZIP codes (original + neighbors) that need scraping

    Process:
        1. Insert original ZIPs into target_zipcodes table (reason='event_trigger')
        2. Call add_neighbor_zipcodes(radius) RPC to add neighbors
        3. Query target_zipcodes to get all ZIPs with reason='event_trigger' or 'neighbor'
        4. Bulk query scraped_zipcodes to filter out ZIPs already in database
        5. Optionally clean up event_trigger entries
        6. Return only ZIPs that need scraping
    """
    # Initialize Supabase client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    supabase: Client = create_client(url, key)

    try:
        # Step 1: Insert original ZIP codes as event triggers
        print(f"📥 Inserting {len(input_zipcodes)} original ZIP codes...", file=sys.stderr)

        for zip_code in input_zipcodes:
            # Use upsert to handle duplicates gracefully
            supabase.table("target_zipcodes").upsert({
                "zip_code": zip_code.strip(),
                "reason": "event_trigger",
                "priority": 0,
                "user_count": 0
            }, on_conflict="zip_code").execute()

        print(f"   ✅ Inserted {len(input_zipcodes)} ZIP codes", file=sys.stderr)

        # Step 2: Add neighboring ZIP codes
        print(f"   🔍 Adding neighboring ZIP codes (radius: ±{radius})...", file=sys.stderr)

        try:
            neighbor_result = supabase.rpc('add_neighbor_zipcodes', {
                'radius': radius
            }).execute()

            neighbor_count = neighbor_result.data if neighbor_result.data is not None else 0
            print(f"   ✅ Added {neighbor_count} neighboring ZIP codes", file=sys.stderr)
        except Exception as e:
            print(f"   ⚠️  Could not add neighboring ZIPs: {e}", file=sys.stderr)
            print(f"   ℹ️  Continuing with just original ZIPs", file=sys.stderr)

        # Step 3: Query to get all relevant ZIP codes
        # Get event_trigger ZIPs and their neighbors
        query = supabase.table("target_zipcodes") \
            .select("zip_code") \
            .in_("reason", ["event_trigger", "neighbor"])

        result = query.execute()

        all_zipcodes = [row["zip_code"] for row in result.data] if result.data else input_zipcodes

        print(f"   📊 Expanded to {len(all_zipcodes)} ZIP codes ({len(input_zipcodes)} original + {len(all_zipcodes) - len(input_zipcodes)} neighbors)", file=sys.stderr)

        # Step 3b: Filter out ZIP codes already in database (bulk query)
        if skip_existing and all_zipcodes:
            print(f"   🔍 Checking which ZIPs are already in database...", file=sys.stderr)

            # Bulk query scraped_zipcodes table
            scraped_query = supabase.table("scraped_zipcodes") \
                .select("zip_code") \
                .in_("zip_code", all_zipcodes)

            scraped_result = scraped_query.execute()

            # Build set of ZIPs already in database
            existing_zips = set()
            if scraped_result.data:
                existing_zips = {row["zip_code"] for row in scraped_result.data}

            # Filter out existing ZIPs
            new_zipcodes = [z for z in all_zipcodes if z not in existing_zips]

            print(f"   ✅ Filtered out {len(existing_zips)} ZIPs already in database", file=sys.stderr)
            print(f"   📊 Final count: {len(new_zipcodes)} new ZIPs need scraping", file=sys.stderr)

            all_zipcodes = new_zipcodes

        # Step 4: Optional cleanup
        if cleanup:
            print(f"   🧹 Cleaning up temporary entries...", file=sys.stderr)
            supabase.table("target_zipcodes") \
                .delete() \
                .eq("reason", "event_trigger") \
                .execute()

            # Also clean up neighbor entries that were only added for this event
            # (Keep neighbors that might have been added for user_location ZIPs)
            supabase.table("target_zipcodes") \
                .delete() \
                .eq("reason", "neighbor") \
                .eq("user_count", 0) \
                .execute()

            print(f"   ✅ Cleanup complete", file=sys.stderr)

        return all_zipcodes

    except Exception as e:
        print(f"❌ Error expanding ZIP codes: {e}", file=sys.stderr)
        print(f"   Falling back to original ZIP codes only", file=sys.stderr)
        return input_zipcodes


def main():
    parser = argparse.ArgumentParser(
        description="Expand ZIP codes by adding neighbors using numeric proximity."
    )
    parser.add_argument(
        "--zips",
        "-z",
        required=True,
        help="Comma-separated list of ZIP codes to expand (e.g., '94102,10001')"
    )
    parser.add_argument(
        "--radius",
        "-r",
        type=int,
        default=5,
        help="Number of neighboring ZIPs to add on each side (default: 5)"
    )
    parser.add_argument(
        "--cleanup",
        "-c",
        action="store_true",
        help="Remove temporary entries from target_zipcodes after expansion"
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        default=True,
        help="Filter out ZIPs that already exist in database (default: True)"
    )
    parser.add_argument(
        "--no-skip-existing",
        dest="skip_existing",
        action="store_false",
        help="Include all ZIPs even if already in database"
    )

    args = parser.parse_args()

    # Parse input ZIP codes
    input_zipcodes = [z.strip() for z in args.zips.split(",") if z.strip()]

    if not input_zipcodes:
        print("❌ Error: No ZIP codes provided", file=sys.stderr)
        sys.exit(1)

    # Expand ZIP codes
    expanded_zipcodes = expand_zipcodes_with_neighbors(
        input_zipcodes,
        radius=args.radius,
        cleanup=args.cleanup,
        skip_existing=args.skip_existing
    )

    # Output comma-separated list to stdout (for workflow capture)
    # All other messages go to stderr, so only this line is captured
    if expanded_zipcodes:
        print(",".join(expanded_zipcodes))
    else:
        # All ZIPs were recently scraped - output empty string
        print("")


if __name__ == "__main__":
    main()
