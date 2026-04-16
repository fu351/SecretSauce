import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

const WINDOW = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

export async function GET() {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createServiceSupabaseClient()
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (!viewerProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const viewerId = viewerProfile.id

    // Run all four queries in parallel
    const [pendingReqs, newFollowers, recentLikes, recentReposts] = await Promise.all([
      // Pending incoming follow requests
      supabase
        .from("follow_requests")
        .select("id, created_at, profiles!follow_requests_follower_id_fkey(id, full_name, avatar_url, username)")
        .eq("following_id", viewerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),

      // New followers (accepted in the last 30 days)
      supabase
        .from("follow_requests")
        .select("updated_at, profiles!follow_requests_follower_id_fkey(id, full_name, avatar_url, username)")
        .eq("following_id", viewerId)
        .eq("status", "accepted")
        .gte("updated_at", WINDOW)
        .order("updated_at", { ascending: false })
        .limit(10),

      // Recent likes on viewer's posts
      supabase
        .from("post_likes")
        .select("created_at, profiles!post_likes_profile_id_fkey(id, full_name, avatar_url, username), posts!post_likes_post_id_fkey(id, title)")
        .eq("posts.author_id", viewerId)
        .gte("created_at", WINDOW)
        .order("created_at", { ascending: false })
        .limit(10),

      // Recent reposts of viewer's posts
      supabase
        .from("post_reposts")
        .select("created_at, profiles!post_reposts_profile_id_fkey(id, full_name, avatar_url, username), posts!post_reposts_post_id_fkey(id, title)")
        .eq("posts.author_id", viewerId)
        .gte("created_at", WINDOW)
        .order("created_at", { ascending: false })
        .limit(10),
    ])

    const notifications: any[] = []

    // Pending follow requests — shown first, always
    for (const r of (pendingReqs.data ?? [])) {
      const from = (r as any).profiles
      if (!from) continue
      notifications.push({ type: "follow_request", requestId: r.id, from, created_at: r.created_at })
    }

    // New followers
    for (const r of (newFollowers.data ?? [])) {
      const from = (r as any).profiles
      if (!from) continue
      notifications.push({ type: "new_follower", from, created_at: r.updated_at })
    }

    // Likes
    for (const r of (recentLikes.data ?? [])) {
      const from = (r as any).profiles
      const post = (r as any).posts
      if (!from || !post) continue
      notifications.push({ type: "post_like", from, post: { id: post.id, title: post.title }, created_at: r.created_at })
    }

    // Reposts
    for (const r of (recentReposts.data ?? [])) {
      const from = (r as any).profiles
      const post = (r as any).posts
      if (!from || !post) continue
      notifications.push({ type: "post_repost", from, post: { id: post.id, title: post.title }, created_at: r.created_at })
    }

    // Sort everything except pending requests by recency (pending stay at top)
    const pending    = notifications.filter((n) => n.type === "follow_request")
    const rest       = notifications.filter((n) => n.type !== "follow_request")
    rest.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ notifications: [...pending, ...rest].slice(0, 20) })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[social/notifications GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
