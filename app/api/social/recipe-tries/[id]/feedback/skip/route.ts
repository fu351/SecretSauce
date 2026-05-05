import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  assertSocialEnabledForFeedback,
  skipRecipeTryFeedback,
} from "@/lib/social/recipe-feedback-service"

export const runtime = "nodejs"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

  const enabled = await assertSocialEnabledForFeedback(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })

  const routeParams = await params

  const result = await skipRecipeTryFeedback(profile.supabase as any, {
    profileId: profile.profileId,
    recipeTryId: routeParams.id,
  })

  if ("validationError" in result) {
    return NextResponse.json({ error: result.validationError }, { status: 400 })
  }
  if ("error" in result && result.error) {
    return NextResponse.json({ error: "Failed to skip feedback" }, { status: 500 })
  }
  return NextResponse.json(result)
}
