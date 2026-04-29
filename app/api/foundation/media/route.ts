import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  getRetentionExpiresAt,
  isMediaPurpose,
  PRIVATE_PRODUCT_MEDIA_BUCKET,
} from "@/lib/foundation/media"
import { normalizeUserFeaturePreferences } from "@/lib/foundation/preferences"

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

export async function GET(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 25)))

    const { data, error } = await (profile.supabase as any)
      .from("media_assets")
      .select("id, purpose, bucket, storage_path, mime_type, byte_size, status, retention_expires_at, deleted_at, derived_metadata, created_at")
      .eq("owner_profile_id", profile.profileId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[foundation/media GET] DB error:", error)
      return NextResponse.json({ error: "Failed to load media assets" }, { status: 500 })
    }

    return NextResponse.json({ mediaAssets: data ?? [] })
  } catch (error) {
    console.error("[foundation/media GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const body = await readJsonObject(req)
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    if (!isMediaPurpose(body.purpose)) {
      return NextResponse.json({ error: "Unsupported media purpose" }, { status: 400 })
    }

    const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : ""
    if (!storagePath.startsWith(`${profile.profileId}/`)) {
      return NextResponse.json({ error: "storagePath must be scoped to the authenticated profile" }, { status: 400 })
    }

    const { data: preferenceRow } = await (profile.supabase as any)
      .from("user_feature_preferences")
      .select("*")
      .eq("profile_id", profile.profileId)
      .maybeSingle()

    const preferences = normalizeUserFeaturePreferences(preferenceRow)
    const createdAt = new Date()

    const { data, error } = await (profile.supabase as any)
      .from("media_assets")
      .insert({
        owner_profile_id: profile.profileId,
        purpose: body.purpose,
        bucket: PRIVATE_PRODUCT_MEDIA_BUCKET,
        storage_path: storagePath,
        mime_type: typeof body.mimeType === "string" ? body.mimeType : null,
        byte_size: typeof body.byteSize === "number" ? Math.max(0, Math.round(body.byteSize)) : null,
        retention_expires_at: getRetentionExpiresAt(createdAt, preferences, body.purpose),
        derived_metadata:
          body.derivedMetadata && typeof body.derivedMetadata === "object" && !Array.isArray(body.derivedMetadata)
            ? body.derivedMetadata
            : {},
        source_product_event_id: typeof body.sourceProductEventId === "string" ? body.sourceProductEventId : null,
      })
      .select("*")
      .single()

    if (error) {
      console.error("[foundation/media POST] DB error:", error)
      return NextResponse.json({ error: "Failed to register media asset" }, { status: 500 })
    }

    return NextResponse.json({ mediaAsset: data })
  } catch (error) {
    console.error("[foundation/media POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
