import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertStreaksEnabled, applyGraceSkip } from "@/lib/streaks/service"
import { getLocalStreakDate } from "@/lib/streaks/calculations"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"
import { getPostHogClient } from "@/lib/posthog-server"

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

export async function POST(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
    const enabled = await assertStreaksEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Streaks are disabled" }, { status: 403 })

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    const streakDate = typeof body.streakDate === "string" ? body.streakDate : getLocalStreakDate(new Date())
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : buildIdempotencyKey(["streak-grace-apply", profile.profileId, streakDate])

    const result = await applyGraceSkip(profile.supabase as any, {
      profileId: profile.profileId,
      streakDate,
      idempotencyKey,
    })
    if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
    if ("error" in result && result.error) return NextResponse.json({ error: "Failed to apply grace skip" }, { status: 500 })

    getPostHogClient().capture({
      distinctId: profile.profileId,
      event: "streak_grace_applied",
      properties: { streak_date: streakDate },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[streaks/grace/apply POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
