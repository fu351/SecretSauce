import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { challengeDB } from "@/lib/database/challenge-db"

export const runtime = "nodejs"

// GET /api/challenges/[id]/leaderboard?scope=global|friends&limit=10
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: challengeId } = await params
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get("scope") === "friends" ? "friends" : "global"
    const limit = Math.min(25, Math.max(1, Number(searchParams.get("limit") ?? 10)))

    const supabase = createServiceSupabaseClient()

    // Resolve viewer for friends scope and rank
    const authState = await auth()
    let viewerProfileId: string | null = null

    if (authState.userId) {
      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", authState.userId)
        .maybeSingle()

      viewerProfileId = viewerProfile?.id ?? null
    }

    const db = challengeDB.withServiceClient(supabase)
    const leaders = await db.getLeaderboard(challengeId, viewerProfileId, scope, limit)

    return NextResponse.json({ leaders })
  } catch (error) {
    console.error("[challenges/leaderboard GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
