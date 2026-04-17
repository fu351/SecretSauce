import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    let profileId = searchParams.get("profileId")
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100)
    const offset = Number(searchParams.get("offset") ?? 0)
    const supabase = createServiceSupabaseClient()

    if (!profileId) {
      const authState = await auth()
      const clerkUserId = authState.userId ?? null
      if (!clerkUserId) {
        return NextResponse.json({ error: "profileId is required" }, { status: 400 })
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle()

      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }

      profileId = profile.id
    }

    const db = followDB.withServiceClient(supabase)

    const [following, total] = await Promise.all([
      db.getFollowing(profileId, limit, offset),
      db.getFollowingCount(profileId),
    ])

    return NextResponse.json({ following, total })
  } catch (error) {
    console.error("[social/following GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
