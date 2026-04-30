import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertBudgetEnabled, dismissBudgetNudge } from "@/lib/budget/service"

export const runtime = "nodejs"

export async function POST() {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })

    const result = await dismissBudgetNudge(profile.supabase as any, profile.profileId)
    if ("error" in result && result.error) {
      console.error("[budget/nudges/dismiss POST] DB error:", result.error)
      return NextResponse.json({ error: "Failed to dismiss nudge" }, { status: 500 })
    }

    return NextResponse.json({ nudgeState: result.nudgeState })
  } catch (error) {
    console.error("[budget/nudges/dismiss POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
