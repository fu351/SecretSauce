import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, shareMealPlanWeek } from "@/lib/social/service"
import { readJsonObject } from "@/app/api/social/_utils"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"

export const runtime = "nodejs"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const routeParams = await params
  const weekIndex = Number(routeParams.id)
  const result = await shareMealPlanWeek(profile.supabase as any, {
    profileId: profile.profileId,
    weekIndex,
    title: typeof body.title === "string" ? body.title : null,
    visibility: typeof body.visibility === "string" ? (body.visibility as any) : undefined,
    estimatedTotalLabel: typeof body.estimatedTotalLabel === "string" ? body.estimatedTotalLabel : null,
    accomplishmentLabels: Array.isArray(body.accomplishmentLabels) ? body.accomplishmentLabels : [],
    idempotencyKey:
      typeof body.idempotencyKey === "string"
        ? body.idempotencyKey
        : buildIdempotencyKey(["meal-plan-share", profile.profileId, weekIndex]),
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 400 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to share meal plan" }, { status: 500 })
  return NextResponse.json(result)
}
