import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertBudgetEnabled, buildBudgetDashboard, computePendingWeeklySummaries } from "@/lib/budget/service"

export const runtime = "nodejs"

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) {
      return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })
    }

    await computePendingWeeklySummaries(profile.supabase as any, profile.profileId)
    const dashboard = await buildBudgetDashboard(profile.supabase as any, profile.profileId)
    return NextResponse.json({ dashboard })
  } catch (error) {
    console.error("[budget/dashboard GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
