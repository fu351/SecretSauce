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

    const supabase = createServiceSupabaseClient()
    const { followerCount, followingCount } = await followDB
      .withServiceClient(supabase)
      .getCounts(profileId)

    return NextResponse.json({ followerCount, followingCount })
  } catch (error) {
    console.error("[social/counts GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
