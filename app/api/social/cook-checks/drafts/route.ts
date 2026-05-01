import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, createCookCheckDraftFromSource, listOwnCookCheckDrafts } from "@/lib/social/service"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"

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

export async function GET() {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const result = await listOwnCookCheckDrafts(profile.supabase as any, profile.profileId)
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to load drafts" }, { status: 500 })
  return NextResponse.json({ drafts: result.drafts })
}

export async function POST(req: Request) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const result = await createCookCheckDraftFromSource(profile.supabase as any, {
    profileId: profile.profileId,
    sourceType: typeof body.sourceType === "string" ? (body.sourceType as any) : "manual_meal",
    sourceRecipeTryId: typeof body.sourceRecipeTryId === "string" ? body.sourceRecipeTryId : null,
    sourceVerificationTaskId: typeof body.sourceVerificationTaskId === "string" ? body.sourceVerificationTaskId : null,
    sourceProductEventId: typeof body.sourceProductEventId === "string" ? body.sourceProductEventId : null,
    caption: typeof body.caption === "string" ? body.caption : null,
    visibility: typeof body.visibility === "string" ? (body.visibility as any) : undefined,
    idempotencyKey:
      typeof body.idempotencyKey === "string"
        ? body.idempotencyKey
        : buildIdempotencyKey(["cook-check-draft", profile.profileId, body.sourceRecipeTryId ?? body.sourceVerificationTaskId ?? Date.now()]),
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 400 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to create draft" }, { status: 500 })
  return NextResponse.json(result)
}
