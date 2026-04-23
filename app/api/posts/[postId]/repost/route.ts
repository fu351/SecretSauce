import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { postDB } from "@/lib/database/post-db"
import { createNotification } from "@/lib/notifications/notification-service"
import { isAbortLikeError } from "@/lib/server/abort-error"

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

    const { data: post } = await supabase
      .from("posts")
      .select("id, author_id, title")
      .eq("id", postId)
      .maybeSingle()

    const reposted = await postDB.withServiceClient(supabase).toggleRepost(postId, profile.id)
    if (reposted && post?.author_id && post.author_id !== profile.id) {
      await createNotification(supabase, {
        recipientId: post.author_id,
        actorId: profile.id,
        type: "post_repost",
        entityType: "post",
        entityId: post.id,
        title: "New post repost",
        body: `${clerkUserId} reposted your post.`,
        payload: {
          post_id: post.id,
          post_title: post.title,
        },
      })
    }
    return NextResponse.json({ reposted })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[posts/repost POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
