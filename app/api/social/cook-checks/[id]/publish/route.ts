import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { assertSocialEnabled, publishCookCheckDraft } from "@/lib/social/service"

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const routeParams = await params
  const result = await publishCookCheckDraft(profile.supabase as any, {
    profileId: profile.profileId,
    cookCheckId: routeParams.id,
    caption: typeof body.caption === "string" ? body.caption : null,
    visibility: typeof body.visibility === "string" ? (body.visibility as any) : undefined,
  })
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 409 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to publish cook check" }, { status: 500 })
  return NextResponse.json(result)
}
