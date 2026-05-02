import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertBudgetEnabled, createFirstBudgetGoal } from "@/lib/budget/service"
import { BUDGET_GOAL_CATEGORIES } from "@/lib/budget/types"
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
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) {
      return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })
    }

    const body = await readJsonObject(req)
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const category = typeof body.category === "string" ? body.category : "generic"
    const targetCents = typeof body.targetCents === "number" ? Math.round(body.targetCents) : 0
    const weeklyBudgetCents = typeof body.weeklyBudgetCents === "number" ? Math.round(body.weeklyBudgetCents) : 0

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
    if (!BUDGET_GOAL_CATEGORIES.includes(category as any)) {
      return NextResponse.json({ error: "Unsupported goal category" }, { status: 400 })
    }
    if (targetCents <= 0) return NextResponse.json({ error: "targetCents must be positive" }, { status: 400 })

    const result = await createFirstBudgetGoal(profile.supabase as any, {
      profileId: profile.profileId,
      name,
      category: category as any,
      targetCents,
      weeklyBudgetCents,
    })

    if ("validationError" in result) {
      return NextResponse.json({ error: result.validationError }, { status: 409 })
    }
    if ("error" in result && result.error) {
      console.error("[budget/goals POST] DB error:", result.error)
      return NextResponse.json({ error: "Failed to create budget goal" }, { status: 500 })
    }

    getPostHogClient(req.headers.get("cookie")).capture({
      distinctId: profile.profileId,
      event: "budget_goal_created",
      properties: { category, target_cents: targetCents },
    })

    return NextResponse.json({ goal: result.goal })
  } catch (error) {
    console.error("[budget/goals POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
