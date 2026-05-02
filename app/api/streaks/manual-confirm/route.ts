import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertStreaksEnabled, manualConfirmMeal } from "@/lib/streaks/service"
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

    const occurredOn = typeof body.occurredOn === "string" ? body.occurredOn : undefined
    const recipeId = typeof body.recipeId === "string" ? body.recipeId : null
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : buildIdempotencyKey(["streak-manual-confirm", profile.profileId, occurredOn ?? new Date().toISOString()])

    const result = await manualConfirmMeal(profile.supabase as any, {
      profileId: profile.profileId,
      occurredOn,
      recipeId,
      idempotencyKey,
    })
    if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
    if ("error" in result && result.error) return NextResponse.json({ error: "Failed to confirm meal" }, { status: 500 })

    getPostHogClient(req.headers.get("cookie")).capture({
      distinctId: profile.profileId,
      event: "meal_verification_confirmed",
      properties: { source: "manual", already_counted: result.alreadyCounted },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[streaks/manual-confirm POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
