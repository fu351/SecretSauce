import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertBudgetEnabled, computePendingWeeklySummaries } from "@/lib/budget/service"

export const runtime = "nodejs"

export async function POST() {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })

    const result = await computePendingWeeklySummaries(profile.supabase as any, profile.profileId)
    return NextResponse.json({ summaries: result.summaries })
  } catch (error) {
    console.error("[budget/weeks/compute POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
