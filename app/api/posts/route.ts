import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { postDB } from "@/lib/database/post-db"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

// POST /api/posts — create a new post
export async function POST(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { imageUrl, title, caption } = await req.json()
    if (!imageUrl || !title) {
      return NextResponse.json({ error: "imageUrl and title are required" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const post = await postDB.withServiceClient(supabase).createPost({
      authorId: profile.id,
      imageUrl,
      title,
      caption,
    })

    if (!post) {
      return NextResponse.json({ error: "Failed to create post" }, { status: 500 })
    }

    return NextResponse.json({ post })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[posts POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
