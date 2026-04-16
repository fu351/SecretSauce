import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    let profileId = searchParams.get("profileId")
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

    const { followerCount, followingCount } = await followDB
      .withServiceClient(supabase)
      .getCounts(profileId)

    return NextResponse.json({ followerCount, followingCount })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[social/counts GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
