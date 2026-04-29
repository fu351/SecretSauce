import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import { isDuplicateDatabaseError } from "@/lib/foundation/product-events"
import {
  isVerificationFeatureArea,
  isVerificationSourceType,
  resolveVerificationStatus,
} from "@/lib/foundation/verification"

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

function readJsonPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
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
      .from("verification_tasks")
      .select("id, feature_area, source_type, status, confidence, media_asset_id, proposed_output, reviewed_at, user_decision, created_at, updated_at")
      .eq("owner_profile_id", profile.profileId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[foundation/verification-tasks GET] DB error:", error)
      return NextResponse.json({ error: "Failed to load verification tasks" }, { status: 500 })
    }

    return NextResponse.json({ verificationTasks: data ?? [] })
  } catch (error) {
    console.error("[foundation/verification-tasks GET] Unexpected error:", error)
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

    if (!isVerificationFeatureArea(body.featureArea)) {
      return NextResponse.json({ error: "Unsupported verification feature area" }, { status: 400 })
    }

    if (!isVerificationSourceType(body.sourceType)) {
      return NextResponse.json({ error: "Unsupported verification source type" }, { status: 400 })
    }

    const confidence =
      typeof body.confidence === "number" && Number.isFinite(body.confidence)
        ? Math.max(0, Math.min(1, body.confidence))
        : null
    const alwaysAsk = body.confirmationMode === "always_ask"
    const status = resolveVerificationStatus(confidence, { alwaysAsk })
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : null

    const insertPayload = {
      owner_profile_id: profile.profileId,
      feature_area: body.featureArea,
      source_type: body.sourceType,
      status,
      confidence,
      media_asset_id: typeof body.mediaAssetId === "string" ? body.mediaAssetId : null,
      source_product_event_id: typeof body.sourceProductEventId === "string" ? body.sourceProductEventId : null,
      proposed_output: readJsonPayload(body.proposedOutput),
      ai_metadata: readJsonPayload(body.aiMetadata),
      idempotency_key: idempotencyKey,
    }

    const { data, error } = await (profile.supabase as any)
      .from("verification_tasks")
      .insert(insertPayload)
      .select("*")
      .single()

    if (isDuplicateDatabaseError(error) && idempotencyKey) {
      const { data: existing } = await (profile.supabase as any)
        .from("verification_tasks")
        .select("*")
        .eq("owner_profile_id", profile.profileId)
        .eq("feature_area", body.featureArea)
        .eq("source_type", body.sourceType)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ verificationTask: existing, duplicate: true })
      }
    }

    if (error) {
      console.error("[foundation/verification-tasks POST] DB error:", error)
      return NextResponse.json({ error: "Failed to create verification task" }, { status: 500 })
    }

    return NextResponse.json({ verificationTask: data, duplicate: false })
  } catch (error) {
    console.error("[foundation/verification-tasks POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
