import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { ALL_BADGE_IDS, MAX_SHOWCASED_BADGES } from "@/lib/badges/badge-definitions"

export const runtime = "nodejs"

export async function PATCH(req: Request) {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { showcasedBadgeIds } = body as { showcasedBadgeIds: string[] }

    if (!Array.isArray(showcasedBadgeIds)) {
      return NextResponse.json({ error: "showcasedBadgeIds must be an array" }, { status: 400 })
    }
    if (showcasedBadgeIds.length > MAX_SHOWCASED_BADGES) {
      return NextResponse.json(
        { error: `Cannot showcase more than ${MAX_SHOWCASED_BADGES} badges` },
        { status: 400 }
      )
    }
    if (!showcasedBadgeIds.every((id) => ALL_BADGE_IDS.includes(id as any))) {
      return NextResponse.json({ error: "Invalid badge ID" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Verify the user actually has these badges
    if (showcasedBadgeIds.length > 0) {
      const { data: ownedBadges } = await supabase
        .from("user_badges")
        .select("badge_id")
        .eq("profile_id", profile.id)
        .in("badge_id", showcasedBadgeIds)

      if ((ownedBadges?.length ?? 0) !== showcasedBadgeIds.length) {
        return NextResponse.json(
          { error: "One or more badges not earned" },
          { status: 400 }
        )
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ showcased_badge_ids: showcasedBadgeIds })
      .eq("id", profile.id)

    if (error) {
      console.error("[profile/badges/showcase PATCH] DB error:", error)
      return NextResponse.json({ error: "Failed to update badge showcase" }, { status: 500 })
    }

    return NextResponse.json({ showcasedBadgeIds })
  } catch (error) {
    console.error("[profile/badges/showcase PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
