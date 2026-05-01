import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  assertSocialEnabledForFeedback,
  submitRecipeTryFeedback,
} from "@/lib/social/recipe-feedback-service"

export const runtime = "nodejs"

async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

  const enabled = await assertSocialEnabledForFeedback(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })

  const routeParams = await params

  const result = await submitRecipeTryFeedback(profile.supabase as any, {
    profileId: profile.profileId,
    recipeTryId: routeParams.id,
    outcome: body.outcome,
    tags: body.tags,
    shareApproved: body.shareApproved,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
  })

  if ("validationError" in result) {
    return NextResponse.json({ error: result.validationError }, { status: 400 })
  }
  if ("error" in result && result.error) {
    return NextResponse.json({ error: "Failed to record feedback" }, { status: 500 })
  }
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
}
