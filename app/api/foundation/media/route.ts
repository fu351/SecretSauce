import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  createMediaAsset,
} from "@/lib/foundation/media-service"

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

    const result = await createMediaAsset(profile.supabase as any, profile.profileId, {
      purpose: body.purpose as any,
      storagePath: typeof body.storagePath === "string" ? body.storagePath.trim() : "",
      mimeType: typeof body.mimeType === "string" ? body.mimeType : null,
      byteSize: typeof body.byteSize === "number" ? body.byteSize : null,
      derivedMetadata:
        body.derivedMetadata && typeof body.derivedMetadata === "object" && !Array.isArray(body.derivedMetadata)
          ? (body.derivedMetadata as Record<string, unknown>)
          : {},
      sourceProductEventId: typeof body.sourceProductEventId === "string" ? body.sourceProductEventId : null,
    })

    if ("validationError" in result) {
      return NextResponse.json({ error: result.validationError }, { status: 400 })
    }
    if ("error" in result && result.error) {
      console.error("[foundation/media POST] DB error:", result.error)
      return NextResponse.json({ error: "Failed to register media asset" }, { status: 500 })
    }

    return NextResponse.json({ mediaAsset: result.mediaAsset })
  } catch (error) {
    console.error("[foundation/media POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
