import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { isAbortLikeError } from "@/lib/server/abort-error"
import { isAdmin, resolveAuthenticatedProfileId } from "@/lib/auth/admin"
import { postDB } from "@/lib/database/post-db"

export const runtime = "nodejs"

function normalizeImageUrl(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params
    const profileId = await resolveAuthenticatedProfileId()
    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceSupabaseClient()
    const { data: post } = await supabase
      .from("posts")
      .select("id, author_id, deleted_at")
      .eq("id", postId)
      .maybeSingle()

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
    if (post.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    const admin = await isAdmin(profileId)
    if (!admin && post.author_id !== profileId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    const imageUrl = normalizeImageUrl(body?.imageUrl)
    const caption = typeof body?.caption === "string" ? body.caption.trim() : ""

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
    }
    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("posts")
      .update({
        title,
        image_url: imageUrl,
        caption: caption || null,
      })
      .eq("id", postId)
      .eq("author_id", admin ? post.author_id : profileId)
      .is("deleted_at", null)
      .select(`
        id, author_id, image_url, title, caption, created_at, updated_at, deleted_at,
        profiles!posts_author_id_fkey ( id, full_name, avatar_url, username ),
        post_likes ( id, profile_id ),
        post_reposts ( id, profile_id )
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const updated = data ? await postDB.withServiceClient(supabase).fetchPostById(postId) : null
    return NextResponse.json({ post: updated ?? data })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[posts/[postId] PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params
    const profileId = await resolveAuthenticatedProfileId()
    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceSupabaseClient()
    const { data: post } = await supabase
      .from("posts")
      .select("id, author_id, deleted_at")
      .eq("id", postId)
      .maybeSingle()

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
    if (post.deleted_at) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    const admin = await isAdmin(profileId)
    if (!admin && post.author_id !== profileId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { error } = await supabase
      .from("posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId)
      .is("deleted_at", null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[posts/[postId] DELETE] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
