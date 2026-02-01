#!/usr/bin/env python3
"""
Update target ZIP codes based on user locations.

This script identifies which ZIP codes should be scraped for grocery stores
based on user ZIP codes in the profiles table.

Usage:
    python scripts/update_target_zipcodes.py
    python scripts/update_target_zipcodes.py --no-neighbors
    python scripts/update_target_zipcodes.py --neighbor-radius 10
"""

import os
import argparse
from supabase import create_client, Client

# Setup
URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(URL, KEY)


def update_target_zipcodes(add_neighbors=True, neighbor_radius=5):
    """
    Update the target_zipcodes table based on current user locations.

    This calls the database function that:
    1. Finds all users with ZIP codes
    2. Adds their ZIP codes as targets
    3. Prioritizes ZIPs by number of users
    4. Optionally adds neighboring ZIPs (numeric proximity)
    """
    print("🎯 Updating target ZIP codes based on user ZIP codes...")

    try:
        # Call the database function
        result = supabase.rpc('update_target_zipcodes').execute()

        count = result.data if result.data is not None else 0
        print(f"   ✅ Processed {count} user ZIP codes")

        # Optionally add neighboring ZIPs based on numeric proximity
        if add_neighbors and count > 0:
            print(f"   🔍 Adding neighboring ZIP codes (radius: {neighbor_radius})...")
            try:
                neighbor_result = supabase.rpc('add_neighbor_zipcodes', {
                    'radius': neighbor_radius
                }).execute()

                neighbor_count = neighbor_result.data if neighbor_result.data is not None else 0
                print(f"   ✅ Added {neighbor_count} neighboring ZIP codes")
            except Exception as e:
                print(f"   ⚠️  Could not add neighboring ZIPs: {e}")
                print(f"   ℹ️  This is optional - continuing with just user ZIPs")

        # Get statistics
        stats_query = supabase.table("target_zipcodes").select("reason", count="exact")
        stats = stats_query.execute()

        total = stats.count or 0
        print(f"\n📊 Target ZIP Code Statistics:")
        print(f"   Total target ZIPs: {total}")

        # Break down by reason
        user_zips = supabase.table("target_zipcodes") \
            .select("*", count="exact") \
            .eq("reason", "user_location") \
            .execute()

        neighbor_zips = supabase.table("target_zipcodes") \
            .select("*", count="exact") \
            .eq("reason", "neighbor") \
            .execute()

        print(f"   User location ZIPs: {user_zips.count or 0}")
        print(f"   Neighboring ZIPs: {neighbor_zips.count or 0}")

        # Show top priority ZIPs
        top_zips = supabase.table("target_zipcodes") \
            .select("zip_code, user_count, priority, reason") \
            .order("priority", desc=True) \
            .limit(10) \
            .execute()

        if top_zips.data:
            print(f"\n🔝 Top 10 Priority ZIP Codes:")
            for zip_data in top_zips.data:
                print(f"   {zip_data['zip_code']}: {zip_data['user_count']} users, "
                      f"priority {zip_data['priority']} ({zip_data['reason']})")

        return total

    except Exception as e:
        print(f"❌ Error updating target ZIP codes: {e}")
        return 0


def get_unscraped_target_count():
    """
    Get count of target ZIP codes that haven't been scraped yet.
    """
    try:
        # Find target ZIPs that aren't in scraped_zipcodes
        result = supabase.rpc('get_unscraped_target_zipcodes_count').execute()
        return result.data if result.data is not None else 0
    except Exception as e:
        # Function might not exist yet, fall back to manual query
        target_zips = supabase.table("target_zipcodes").select("zip_code").execute()
        scraped_zips = supabase.table("scraped_zipcodes").select("zip_code").execute()

        target_set = set(z['zip_code'] for z in target_zips.data)
        scraped_set = set(z['zip_code'] for z in scraped_zips.data)

        unscraped = target_set - scraped_set
        return len(unscraped)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update target ZIP codes based on user locations.")
    parser.add_argument(
        "--no-neighbors",
        action="store_true",
        help="Don't add neighboring ZIP codes (only use exact user ZIPs)"
    )
    parser.add_argument(
        "--neighbor-radius",
        type=int,
        default=5,
        help="How many neighboring ZIPs to add on each side (default: 5)"
    )
    args = parser.parse_args()

    total = update_target_zipcodes(
        add_neighbors=not args.no_neighbors,
        neighbor_radius=args.neighbor_radius
    )

    if total > 0:
        print(f"\n💡 Next steps:")
        print(f"   1. Run import_new_stores.py to scrape these target ZIP codes")
        print(f"   2. The script will prioritize ZIPs with more users")
        print(f"   3. Already-scraped ZIPs will be skipped (unless refreshing)")
    else:
        print(f"\n⚠️  No users with ZIP codes found!")
        print(f"   Make sure users have zip_code set in the profiles table")
