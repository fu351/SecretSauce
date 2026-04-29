import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  buildPreferenceDbUpdate,
  normalizeUserFeaturePreferences,
} from "@/lib/foundation/preferences"

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

    const { data, error } = await (profile.supabase as any)
      .from("user_feature_preferences")
      .select("*")
      .eq("profile_id", profile.profileId)
      .maybeSingle()

    if (error) {
      console.error("[foundation/preferences GET] DB error:", error)
      return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 })
    }

    return NextResponse.json({ preferences: normalizeUserFeaturePreferences(data) })
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

    const update = buildPreferenceDbUpdate(body)
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid preference fields to update" }, { status: 400 })
    }

    const { data, error } = await (profile.supabase as any)
      .from("user_feature_preferences")
      .upsert(
        {
          profile_id: profile.profileId,
          ...update,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      )
      .select("*")
      .single()

    if (error) {
      console.error("[foundation/preferences PATCH] DB error:", error)
      return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 })
    }

    return NextResponse.json({
      preferences: normalizeUserFeaturePreferences(data ?? update),
    })
  } catch (error) {
    console.error("[foundation/preferences PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
