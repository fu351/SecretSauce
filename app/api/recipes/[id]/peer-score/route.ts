import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { getRecipePeerScore } from "@/lib/social/recipe-feedback-service"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })

  const routeParams = await params
  if (!routeParams.id) return NextResponse.json({ error: "Missing recipe id" }, { status: 400 })

  const result = await getRecipePeerScore(profile.supabase as any, routeParams.id)
  if ("error" in result && result.error) {
    return NextResponse.json({ error: "Failed to load peer score" }, { status: 500 })
  }
  return NextResponse.json(result)
}
