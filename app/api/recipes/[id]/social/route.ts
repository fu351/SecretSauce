import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

type ProfileSnippet = {
  id: string
  full_name: string | null
  avatar_url: string | null
  username: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const authState = await auth()
    const supabase = createServiceSupabaseClient()

    // Resolve viewer profile ID (optional — unauthenticated users still get counts)
    let viewerId: string | null = null
    if (authState.userId) {
      const { data: vp } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", authState.userId)
        .maybeSingle()
      viewerId = vp?.id ?? null
    }

    // Counts + viewer status for likes and reposts — all in parallel
    const [likeCountResult, viewerLikeResult, repostCountResult, viewerRepostResult] = await Promise.all([
      supabase
        .from("recipe_likes")
        .select("id", { count: "exact", head: true })
        .eq("recipe_id", recipeId),

      viewerId
        ? supabase
            .from("recipe_likes")
            .select("id")
            .eq("recipe_id", recipeId)
            .eq("profile_id", viewerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      supabase
        .from("recipe_reposts")
        .select("id", { count: "exact", head: true })
        .eq("recipe_id", recipeId),

      viewerId
        ? supabase
            .from("recipe_reposts")
            .select("id")
            .eq("recipe_id", recipeId)
            .eq("profile_id", viewerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const likeCount = likeCountResult.count ?? 0
    const isLiked = !!viewerLikeResult.data
    const repostCount = repostCountResult.count ?? 0
    const isReposted = !!viewerRepostResult.data

    // Friend likes + all following IDs (for review sorting)
    let friendLikes: ProfileSnippet[] = []
    let friendProfileIds: string[] = []

    if (viewerId) {
      // Get everyone the viewer follows (accepted)
      const { data: following } = await supabase
        .from("follow_requests")
        .select("following_id")
        .eq("follower_id", viewerId)
        .eq("status", "accepted")

      friendProfileIds = (following ?? []).map((r) => r.following_id)

      if (friendProfileIds.length > 0) {
        // Which of those friends liked this recipe?
        const { data: fl } = await supabase
          .from("recipe_likes")
          .select("profile_id, profiles!recipe_likes_profile_id_fkey(id, full_name, avatar_url, username)")
          .eq("recipe_id", recipeId)
          .in("profile_id", friendProfileIds)
          .limit(5)

        friendLikes = (fl ?? [])
          .map((r: any) => r.profiles)
          .filter(Boolean)
      }
    }

    return NextResponse.json({ likeCount, isLiked, repostCount, isReposted, friendLikes, friendProfileIds })
  } catch (error) {
    console.error("[recipes/[id]/social GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
