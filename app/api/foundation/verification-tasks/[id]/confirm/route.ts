import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { resolveUserConfirmationStatus } from "@/lib/foundation/verification"

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const body = await readJsonObject(req)
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const status = resolveUserConfirmationStatus(body.decision)
    if (!status) {
      return NextResponse.json({ error: "decision must be confirm or reject" }, { status: 400 })
    }

    const { id } = await params
    const { data: existing, error: lookupError } = await (profile.supabase as any)
      .from("verification_tasks")
      .select("id, owner_profile_id, status, user_decision")
      .eq("id", id)
      .eq("owner_profile_id", profile.profileId)
      .maybeSingle()

    if (lookupError) {
      console.error("[foundation/verification confirm] Lookup error:", lookupError)
      return NextResponse.json({ error: "Failed to load verification task" }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: "Verification task not found" }, { status: 404 })
    }

    const decisionPayload =
      body.confirmedOutput && typeof body.confirmedOutput === "object" && !Array.isArray(body.confirmedOutput)
        ? body.confirmedOutput
        : {}

    const { data, error } = await (profile.supabase as any)
      .from("verification_tasks")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewer_profile_id: profile.profileId,
        user_decision: {
          decision: body.decision,
          output: decisionPayload,
        },
      })
      .eq("id", id)
      .eq("owner_profile_id", profile.profileId)
      .select("*")
      .single()

    if (error) {
      console.error("[foundation/verification confirm] Update error:", error)
      return NextResponse.json({ error: "Failed to update verification task" }, { status: 500 })
    }

    return NextResponse.json({ verificationTask: data })
  } catch (error) {
    console.error("[foundation/verification confirm] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
