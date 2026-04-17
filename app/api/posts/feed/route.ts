import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { postDB } from "@/lib/database/post-db"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

// GET /api/posts/feed?limit=20&offset=0
export async function GET(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null

    const { searchParams } = new URL(req.url)
    const limit  = Math.min(Number(searchParams.get("limit")  ?? 20), 50)
    const offset = Number(searchParams.get("offset") ?? 0)

    const supabase = createServiceSupabaseClient()
    let viewerProfileId: string | null = null

    if (clerkUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .single()
      viewerProfileId = profile?.id ?? null
    }

    const posts = await postDB
      .withServiceClient(supabase)
      .getFeedPosts(viewerProfileId, limit, offset)

    return NextResponse.json({ posts })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[posts/feed GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
