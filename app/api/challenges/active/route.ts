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

    const { star, community } = await db.getActiveChallenges()

    // Resolve viewer profile if authenticated
    const authState = await auth()
    let starEntry    = null
    let starRank     = null
    let communityEntries: Record<string, unknown> = {}
    let viewerProfileId: string | null = null

    if (authState.userId) {
      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", authState.userId)
        .maybeSingle()

      if (viewerProfile) {
        viewerProfileId = viewerProfile.id

        if (star) {
          starEntry = await db.getEntry(star.id, viewerProfileId)
          if (starEntry) {
            starRank = await db.getViewerRank(star.id, viewerProfileId, "friends")
          }
        }

        const communityEntryResults = await Promise.all(
          community.map(async (c) => ({
            challengeId: c.id,
            entry: await db.getEntry(c.id, viewerProfileId!),
            vote:  await db.getViewerVote(c.id, viewerProfileId!),
          }))
        )
        communityEntries = Object.fromEntries(
          communityEntryResults.map(({ challengeId, entry, vote }) => [
            challengeId,
            { entry, vote },
          ])
        )
      }
    }

    return NextResponse.json({
      starChallenge:     star,
      communityChallenges: community,
      starEntry,
      starRank,
      communityEntries,
      viewerProfileId,
      // Legacy field — keeps old clients from breaking (first active challenge of any type)
      challenge: star ?? community[0] ?? null,
      entry:     starEntry,
      rank:      starRank,
    })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[challenges/active GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
