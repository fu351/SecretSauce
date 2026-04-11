import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { challengeDB } from "@/lib/database/challenge-db"

export const runtime = "nodejs"

// POST /api/challenges/[id]/join — join or update entry (optionally with postId)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: challengeId } = await params

    const body = await req.json().catch(() => ({}))
    const postId: string | null = typeof body.postId === "string" ? body.postId : null

    const supabase = createServiceSupabaseClient()

    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (!viewerProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Verify challenge exists and is active
    const now = new Date().toISOString()
    const { data: challenge } = await supabase
      .from("challenges")
      .select("id, ends_at")
      .eq("id", challengeId)
      .lte("starts_at", now)
      .gte("ends_at", now)
      .maybeSingle()

    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found or not active" }, { status: 404 })
    }

    const db = challengeDB.withServiceClient(supabase)
    const entry = await db.joinChallenge(challengeId, viewerProfile.id, postId)

    if (!entry) {
      return NextResponse.json({ error: "Failed to join challenge" }, { status: 500 })
    }

    return NextResponse.json({ entry })
  } catch (error) {
    console.error("[challenges/join POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
