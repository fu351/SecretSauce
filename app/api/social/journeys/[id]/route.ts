import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, recordJourneyProgressEvent } from "@/lib/social/service"
import { readJsonObject } from "@/app/api/social/_utils"

export const runtime = "nodejs"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const routeParams = await params
  const result = await recordJourneyProgressEvent(profile.supabase as any, {
    profileId: profile.profileId,
    journeyId: routeParams.id,
    eventType: typeof body.eventType === "string" ? body.eventType : "manual_progress",
    progressDelta: typeof body.progressDelta === "number" ? body.progressDelta : 1,
    sourceRecipeTryId: typeof body.sourceRecipeTryId === "string" ? body.sourceRecipeTryId : null,
    sourceWeekIndex: typeof body.sourceWeekIndex === "number" ? body.sourceWeekIndex : null,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to update journey" }, { status: 500 })
  return NextResponse.json(result)
}
