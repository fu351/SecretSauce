import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

export async function GET() {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    const db = followDB.withServiceClient(supabase)
    const [following, counts] = await Promise.all([
      db.getFollowing(profile.id, 10, 0),
      db.getCounts(profile.id),
    ])

    return NextResponse.json({
      following,
      followerCount:  counts.followerCount,
      followingCount: counts.followingCount,
    })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[social/friends-preview GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
