import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertBudgetEnabled, logBudgetSpendEntry } from "@/lib/budget/service"
import { BUDGET_SPEND_SOURCES } from "@/lib/budget/types"
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

    const enabled = await assertBudgetEnabled(profile.supabase as any, profile.profileId)
    if (!enabled) return NextResponse.json({ error: "Budget tracking is disabled" }, { status: 403 })

    const body = await readJsonObject(req)
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

    const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0
    const sourceType = typeof body.sourceType === "string" ? body.sourceType : "manual"
    if (amountCents <= 0) return NextResponse.json({ error: "amountCents must be positive" }, { status: 400 })
    if (!BUDGET_SPEND_SOURCES.includes(sourceType as any)) {
      return NextResponse.json({ error: "Unsupported spend source type" }, { status: 400 })
    }

    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : buildIdempotencyKey(["budget-spend", profile.profileId, sourceType, amountCents, body.occurredAt ?? Date.now()])

    const result = await logBudgetSpendEntry(profile.supabase as any, {
      profileId: profile.profileId,
      amountCents,
      sourceType: sourceType as any,
      occurredAt: typeof body.occurredAt === "string" ? body.occurredAt : undefined,
      note: typeof body.note === "string" ? body.note : null,
      mediaAssetId: typeof body.mediaAssetId === "string" ? body.mediaAssetId : null,
      verificationTaskId: typeof body.verificationTaskId === "string" ? body.verificationTaskId : null,
      idempotencyKey,
    })

    if ("validationError" in result) {
      return NextResponse.json({ error: result.validationError }, { status: 400 })
    }
    if ("error" in result && result.error) {
      console.error("[budget/spend POST] DB error:", result.error)
      return NextResponse.json({ error: "Failed to log spend" }, { status: 500 })
    }

    getPostHogClient(req.headers.get("cookie")).capture({
      distinctId: profile.profileId,
      event: "budget_spend_logged",
      properties: { source_type: sourceType, amount_cents: amountCents, duplicate: result.duplicate ?? false },
    })

    return NextResponse.json({ spendLog: result.spendLog, duplicate: result.duplicate ?? false })
  } catch (error) {
    console.error("[budget/spend POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
