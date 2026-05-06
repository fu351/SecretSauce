import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, createCookingJourneyForProfile, listOwnCookingJourneys } from "@/lib/social/service"
import { readJsonObject } from "@/app/api/social/_utils"

export const runtime = "nodejs"

export async function GET() {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const result = await listOwnCookingJourneys(profile.supabase as any, profile.profileId)
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to load journeys" }, { status: 500 })
  return NextResponse.json({ journeys: result.journeys })
}

export async function POST(req: Request) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const result = await createCookingJourneyForProfile(profile.supabase as any, {
    profileId: profile.profileId,
    title: typeof body.title === "string" ? body.title : null,
    journeyType: typeof body.journeyType === "string" ? body.journeyType : null,
    targetCount: typeof body.targetCount === "number" ? body.targetCount : null,
    visibility: typeof body.visibility === "string" ? (body.visibility as any) : undefined,
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 400 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to create journey" }, { status: 500 })
  return NextResponse.json(result)
}
