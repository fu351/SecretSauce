import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { postDB, type PostWithMeta } from "@/lib/database/post-db"
import type { ProfilePagedResult } from "@/lib/social/profile-content"
import { resolveProfileAccess } from "@/lib/social/profile-access"

export const runtime = "nodejs"

const PAGE_SIZE = 12

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params
    const { searchParams } = new URL(req.url)
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0))
    const limit = Math.min(PAGE_SIZE, Math.max(1, Number(searchParams.get("limit") ?? PAGE_SIZE)))

    const access = await resolveProfileAccess(rawUsername)

    if (!access) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!access.canViewContent) {
      return NextResponse.json({ error: "Profile is private" }, { status: 403 })
    }

    const supabase = createServiceSupabaseClient()
    const posts = await postDB
      .withServiceClient(supabase)
      .getPostsByAuthor(access.profile.id, access.viewerProfileId, limit, offset)

    const payload: ProfilePagedResult<PostWithMeta> & { posts: PostWithMeta[] } = {
      items: posts,
      posts,
      hasMore: posts.length === limit,
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("[users/posts GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
