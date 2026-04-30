import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertStreaksEnabled, confirmStreakVerification } from "@/lib/streaks/service"
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
    const enabled = await assertStreaksEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Streaks are disabled" }, { status: 403 })

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    const routeParams = await params
    const verificationTaskId = routeParams.id
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : buildIdempotencyKey(["streak-verification-confirm", profile.profileId, verificationTaskId])

    const result = await confirmStreakVerification(profile.supabase as any, {
      profileId: profile.profileId,
      verificationTaskId,
      recipeId: typeof body.recipeId === "string" ? body.recipeId : null,
      occurredOn: typeof body.occurredOn === "string" ? body.occurredOn : undefined,
      idempotencyKey,
    })
    if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
    if ("error" in result && result.error) return NextResponse.json({ error: "Failed to confirm verification" }, { status: 500 })

    getPostHogClient().capture({
      distinctId: profile.profileId,
      event: "streak_day_counted",
      properties: { already_counted: result.alreadyCounted ?? false },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[streaks/verification/[id]/confirm POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
