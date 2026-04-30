import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { buildStreakDashboard } from "@/lib/streaks/service"

export const runtime = "nodejs"

export async function GET() {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

    const dashboard = await buildStreakDashboard(profile.supabase as any, profile.profileId)
    return NextResponse.json({ dashboard })
  } catch (error) {
    console.error("[streaks/dashboard GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
