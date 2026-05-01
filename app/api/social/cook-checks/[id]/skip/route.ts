import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, skipCookCheckDraft } from "@/lib/social/service"

export const runtime = "nodejs"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const routeParams = await params
  const result = await skipCookCheckDraft(profile.supabase as any, {
    profileId: profile.profileId,
    cookCheckId: routeParams.id,
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to skip cook check" }, { status: 500 })
  return NextResponse.json(result)
}
