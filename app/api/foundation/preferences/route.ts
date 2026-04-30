import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  getOrCreateUserFeaturePreferences,
  updateUserFeaturePreferences,
} from "@/lib/foundation/preferences-service"

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
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const result = await getOrCreateUserFeaturePreferences(profile.supabase as any, profile.profileId)
    if (result.error) {
      console.error("[foundation/preferences GET] DB error:", result.error)
      return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 })
    }

    return NextResponse.json({ preferences: result.preferences })
  } catch (error) {
    console.error("[foundation/preferences GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const body = await readJsonObject(req)
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const result = await updateUserFeaturePreferences(profile.supabase as any, profile.profileId, body)
    if (result.validationError) {
      return NextResponse.json({ error: result.validationError }, { status: 400 })
    }
    if (result.error || !result.preferences) {
      console.error("[foundation/preferences PATCH] DB error:", result.error)
      return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 })
    }

    return NextResponse.json({ preferences: result.preferences })
  } catch (error) {
    console.error("[foundation/preferences PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
