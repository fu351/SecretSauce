import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { challengeDB } from "@/lib/database/challenge-db"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

export async function GET() {
  try {
    const supabase = createServiceSupabaseClient()
    const db = challengeDB.withServiceClient(supabase)

    const challenge = await db.getActiveChallenge()
    if (!challenge) {
      return NextResponse.json({ challenge: null })
    }

    const participantCount = await db.getParticipantCount(challenge.id)

    // Resolve viewer profile if authenticated
    const authState = await auth()
    let entry    = null
    let rank     = null
    let viewerProfileId: string | null = null

    if (authState.userId) {
      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", authState.userId)
        .maybeSingle()

      if (viewerProfile) {
        viewerProfileId = viewerProfile.id
        entry = await db.getEntry(challenge.id, viewerProfileId)
        if (entry) {
          rank = await db.getViewerRank(challenge.id, viewerProfileId, "friends")
        }
      }
    }

    return NextResponse.json({
      challenge: { ...challenge, participant_count: participantCount },
      entry,
      rank,
      viewerProfileId,
    })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[challenges/active GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
