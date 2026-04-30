import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { allocateWeeklySurplus, assertBudgetEnabled } from "@/lib/budget/service"
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

export async function POST(req: Request, { params }: { params: Promise<{ weekStart: string }> }) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    const routeParams = await params
    const weekStart = routeParams.weekStart

    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : buildIdempotencyKey(["budget-allocate", profile.profileId, weekStart])

    const result = await allocateWeeklySurplus(profile.supabase as any, {
      profileId: profile.profileId,
      weekStartDate: weekStart,
      idempotencyKey,
    })
    if ("validationError" in result) {
      return NextResponse.json({ error: result.validationError }, { status: 409 })
    }
    if ("error" in result && result.error) {
      console.error("[budget/weeks/[weekStart]/allocate POST] DB error:", result.error)
      return NextResponse.json({ error: "Failed to allocate surplus" }, { status: 500 })
    }

    getPostHogClient().capture({
      distinctId: profile.profileId,
      event: "budget_surplus_allocated",
      properties: { week_start_date: weekStart, duplicate: result.duplicate ?? false },
    })

    return NextResponse.json({
      contribution: result.contribution,
      goal: result.goal,
      duplicate: result.duplicate ?? false,
    })
  } catch (error) {
    console.error("[budget/weeks/[weekStart]/allocate POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
