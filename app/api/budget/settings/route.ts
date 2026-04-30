import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertBudgetEnabled, ensureBudgetSettings } from "@/lib/budget/service"

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

export async function PATCH(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

    const weeklyBudgetCents = typeof body.weeklyBudgetCents === "number" ? Math.max(0, Math.round(body.weeklyBudgetCents)) : null
    if (weeklyBudgetCents === null) {
      return NextResponse.json({ error: "weeklyBudgetCents is required" }, { status: 400 })
    }

    const { data, error } = await ensureBudgetSettings(profile.supabase as any, profile.profileId, weeklyBudgetCents)
    if (error) {
      console.error("[budget/settings PATCH] DB error:", error)
      return NextResponse.json({ error: "Failed to update budget settings" }, { status: 500 })
    }

    return NextResponse.json({ settings: data })
  } catch (error) {
    console.error("[budget/settings PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
