import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { postDB } from "@/lib/database/post-db"

export const runtime = "nodejs"

// POST /api/posts/[postId]/repost — toggle repost
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { postId } = await params

    const supabase = createServiceSupabaseClient()
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const reposted = await postDB.withServiceClient(supabase).toggleRepost(postId, profile.id)
    return NextResponse.json({ reposted })
  } catch (error) {
    console.error("[posts/repost POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
