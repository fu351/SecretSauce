"""Update target ZIP codes based on user locations in the profiles table."""

from __future__ import annotations

import argparse

from .db import get_supabase_client


def update_target_zipcodes(add_neighbors: bool = True, neighbor_radius: int = 5) -> int:
    """
    Update the target_zipcodes table based on current user locations.

    Calls the database functions that:
    1. Find all users with ZIP codes and add them as targets
    2. Prioritize ZIPs by number of users
    3. Optionally add neighboring ZIPs (numeric proximity)
    """
    supabase = get_supabase_client()
    print("🎯 Updating target ZIP codes based on user ZIP codes...")

    try:
        result = supabase.rpc("update_target_zipcodes").execute()
        count = result.data if result.data is not None else 0
        print(f"   ✅ Processed {count} user ZIP codes")

        if add_neighbors and count > 0:
            print(f"   🔍 Adding neighboring ZIP codes (radius: {neighbor_radius})...")
            try:
                neighbor_result = supabase.rpc(
                    "add_neighbor_zipcodes", {"radius": neighbor_radius}
                ).execute()
                neighbor_count = neighbor_result.data if neighbor_result.data is not None else 0
                print(f"   ✅ Added {neighbor_count} neighboring ZIP codes")
            except Exception as e:
                print(f"   ⚠️  Could not add neighboring ZIPs: {e}")
                print("   ℹ️  This is optional - continuing with just user ZIPs")

        stats_query = supabase.table("target_zipcodes").select("reason", count="exact")
        stats = stats_query.execute()
        total = stats.count or 0
        print(f"\n📊 Target ZIP Code Statistics:")
        print(f"   Total target ZIPs: {total}")

        user_zips = (
            supabase.table("target_zipcodes")
            .select("*", count="exact")
            .eq("reason", "user_location")
            .execute()
        )
        neighbor_zips = (
            supabase.table("target_zipcodes")
            .select("*", count="exact")
            .eq("reason", "neighbor")
            .execute()
        )
        print(f"   User location ZIPs: {user_zips.count or 0}")
        print(f"   Neighboring ZIPs: {neighbor_zips.count or 0}")

        top_zips = (
            supabase.table("target_zipcodes")
            .select("zip_code, user_count, priority, reason")
            .order("priority", desc=True)
            .limit(10)
            .execute()
        )
        if top_zips.data:
            print("\n🔝 Top 10 Priority ZIP Codes:")
            for zip_data in top_zips.data:
                print(
                    f"   {zip_data['zip_code']}: {zip_data['user_count']} users, "
                    f"priority {zip_data['priority']} ({zip_data['reason']})"
                )

        return total

    except Exception as e:
        print(f"❌ Error updating target ZIP codes: {e}")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update target ZIP codes based on user locations."
    )
    parser.add_argument(
        "--no-neighbors",
        action="store_true",
        help="Don't add neighboring ZIP codes (only use exact user ZIPs)",
    )
    parser.add_argument(
        "--neighbor-radius",
        type=int,
        default=5,
        help="How many neighboring ZIPs to add on each side (default: 5)",
    )
    args = parser.parse_args()
    update_target_zipcodes(
        add_neighbors=not args.no_neighbors,
        neighbor_radius=args.neighbor_radius,
    )
