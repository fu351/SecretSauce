import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { challengeDB } from "@/lib/database/challenge-db"

export const runtime = "nodejs"

// POST /api/challenges/[id]/vote
// body: { entryProfileId: string } — profile to vote for
// DELETE /api/challenges/[id]/vote — remove your vote
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
    const entryProfileId: string | null =
      typeof body.entryProfileId === "string" ? body.entryProfileId : null

    if (!entryProfileId) {
      return NextResponse.json({ error: "entryProfileId is required" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Verify challenge is active community challenge
    const now = new Date().toISOString()
    const { data: challenge } = await supabase
      .from("challenges")
      .select("id, challenge_type")
      .eq("id", challengeId)
      .eq("challenge_type", "community")
      .lte("starts_at", now)
      .gte("ends_at", now)
      .maybeSingle()

    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found, not active, or not a community challenge" }, { status: 404 })
    }

    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (!viewerProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (viewerProfile.id === entryProfileId) {
      return NextResponse.json({ error: "Cannot vote for your own entry" }, { status: 400 })
    }

    const db = challengeDB.withServiceClient(supabase)
    const vote = await db.castVote(challengeId, viewerProfile.id, entryProfileId)

    if (!vote) {
      return NextResponse.json({ error: "Failed to cast vote" }, { status: 500 })
    }

    return NextResponse.json({ vote })
  } catch (error) {
    console.error("[challenges/vote POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: challengeId } = await params

    const supabase = createServiceSupabaseClient()
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (!viewerProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const db = challengeDB.withServiceClient(supabase)
    await db.removeVote(challengeId, viewerProfile.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[challenges/vote DELETE] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
