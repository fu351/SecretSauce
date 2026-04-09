import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const profileId = searchParams.get("profileId")
    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 })
    }

    const limit  = Math.min(Number(searchParams.get("limit")  ?? 50), 100)
    const offset = Number(searchParams.get("offset") ?? 0)

    const supabase = createServiceSupabaseClient()
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
