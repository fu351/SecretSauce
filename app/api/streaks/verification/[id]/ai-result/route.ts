import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertStreaksEnabled } from "@/lib/streaks/service"

export const runtime = "nodejs"

async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
    const enabled = await assertStreaksEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Streaks are disabled" }, { status: 403 })

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    const routeParams = await params
    const status = typeof body.status === "string" ? body.status : "pending"
    const confidence = typeof body.confidence === "number" ? body.confidence : null

    const allowed = ["pending", "auto_accepted", "needs_confirmation"]
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid verification status" }, { status: 400 })
    }

    const { data, error } = await (profile.supabase as any)
      .from("verification_tasks")
      .update({
        status,
        confidence,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", routeParams.id)
      .eq("owner_profile_id", profile.profileId)
      .eq("feature_area", "streaks")
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: "Failed to apply AI result" }, { status: 500 })

    return NextResponse.json({ verificationTask: data })
  } catch (error) {
    console.error("[streaks/verification/[id]/ai-result POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
