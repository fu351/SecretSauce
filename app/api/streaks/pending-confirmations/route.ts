import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertStreaksEnabled } from "@/lib/streaks/service"
import { listPendingStreakVerificationTasks } from "@/lib/streaks/repository"

export const runtime = "nodejs"

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
    const enabled = await assertStreaksEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ pendingConfirmations: [] })

    const { data, error } = await listPendingStreakVerificationTasks(profile.supabase as any, profile.profileId)
    if (error) return NextResponse.json({ error: "Failed to load pending confirmations" }, { status: 500 })
    return NextResponse.json({ pendingConfirmations: data })
  } catch (error) {
    console.error("[streaks/pending-confirmations GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
