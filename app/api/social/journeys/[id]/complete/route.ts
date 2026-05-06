import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, completeCookingJourney } from "@/lib/social/service"
import { readJsonObject } from "@/app/api/social/_utils"

export const runtime = "nodejs"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const routeParams = await params
  const result = await completeCookingJourney(profile.supabase as any, {
    profileId: profile.profileId,
    journeyId: routeParams.id,
    visibility: typeof body.visibility === "string" ? (body.visibility as any) : undefined,
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to complete journey" }, { status: 500 })
  return NextResponse.json(result)
}
