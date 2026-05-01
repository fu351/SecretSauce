import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  assertSocialEnabled,
  getSocialPreferencesForProfile,
  updateSocialPreferencesForProfile,
} from "@/lib/social/service"

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
  const result = await getSocialPreferencesForProfile(profile.supabase as any, profile.profileId)
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 })
  return NextResponse.json({ preferences: result.preferences })
}

export async function PATCH(req: Request) {
  const profile = await getAuthenticatedProfile()
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: profile.status })
  const enabled = await assertSocialEnabled(profile.supabase as any, profile.profileId)
  if (!enabled) return NextResponse.json({ error: "Social is disabled" }, { status: 403 })
  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  const result = await updateSocialPreferencesForProfile(profile.supabase as any, profile.profileId, body)
  if ("validationError" in result) return NextResponse.json({ error: result.validationError }, { status: 400 })
  if ("error" in result && result.error) return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 })
  return NextResponse.json({ preferences: result.preferences })
}
