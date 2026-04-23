import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { challengeDB } from "@/lib/database/challenge-db"
import { awardBadges } from "@/lib/badges/award-badge"

export const runtime = "nodejs"

// GET /api/dev/challenges/[id]/winners
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin()
  const { id: challengeId } = await params
  const supabase = createServiceSupabaseClient()
  const db = challengeDB.withServiceClient(supabase)

  const winners = await db.getWinners(challengeId)

  const profileIds = winners.map((w) => w.profile_id)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", profileIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    winners: winners.map((w) => ({ ...w, profile: profileMap[w.profile_id] ?? null })),
  })
}

// PUT /api/dev/challenges/[id]/winners
// body: { profileIds: string[] } — ordered array, index 0 = rank 1
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin()
  const { id: challengeId } = await params
  const body = await req.json()
  const profileIds: string[] = Array.isArray(body.profileIds) ? body.profileIds : []

  const supabase = createServiceSupabaseClient()

  // Verify this is a star challenge
  const { data: challenge } = await supabase
    .from("challenges")
    .select("id, challenge_type, winner_count")
    .eq("id", challengeId)
    .eq("challenge_type", "star")
    .maybeSingle()

  if (!challenge) {
    return NextResponse.json({ error: "Star challenge not found" }, { status: 404 })
  }

  if (profileIds.length > challenge.winner_count) {
    return NextResponse.json(
      { error: `Cannot set more than ${challenge.winner_count} winners` },
      { status: 400 }
    )
  }

  const db = challengeDB.withServiceClient(supabase)
  const ok = await db.setWinners(challengeId, profileIds)

  if (!ok) {
    return NextResponse.json({ error: "Failed to set winners" }, { status: 500 })
  }

  // Award the Challenge Winner badge to each selected winner
  if (profileIds.length > 0) {
    await Promise.all(
      profileIds.map((profileId) => awardBadges(supabase, profileId, ["challenge_winner"]))
    )
  }

  return NextResponse.json({ success: true })
}
