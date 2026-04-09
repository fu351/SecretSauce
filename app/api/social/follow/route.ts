import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"

export const runtime = "nodejs"

async function resolveProfileId(clerkUserId: string) {
  const supabase = createServiceSupabaseClient()
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .single()
  return { supabase, profileId: data?.id ?? null }
}

export async function POST(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { followingId } = await req.json()
    if (!followingId) {
      return NextResponse.json({ error: "followingId is required" }, { status: 400 })
    }

    const { supabase, profileId } = await resolveProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (followingId === profileId) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 })
    }

    const request = await followDB.withServiceClient(supabase).sendFollowRequest(profileId, followingId)
    if (!request) {
      return NextResponse.json({ error: "Failed to send follow request" }, { status: 500 })
    }

    return NextResponse.json({ request })
  } catch (error) {
    console.error("[social/follow POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { followingId } = await req.json()
    if (!followingId) {
      return NextResponse.json({ error: "followingId is required" }, { status: 400 })
    }

    const { supabase, profileId } = await resolveProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const success = await followDB.withServiceClient(supabase).cancelFollow(profileId, followingId)
    if (!success) {
      return NextResponse.json({ error: "Failed to unfollow" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[social/follow DELETE] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
