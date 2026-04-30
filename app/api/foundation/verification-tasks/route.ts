import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  isVerificationFeatureArea,
  isVerificationSourceType,
} from "@/lib/foundation/verification"
import { createVerificationTaskWithRouting } from "@/lib/foundation/verification-service"

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

    const result = await createVerificationTaskWithRouting(profile.supabase as any, profile.profileId, {
      featureArea: body.featureArea as string,
      sourceType: body.sourceType as string,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
      confirmationMode: typeof body.confirmationMode === "string" ? body.confirmationMode : undefined,
      mediaAssetId: typeof body.mediaAssetId === "string" ? body.mediaAssetId : null,
      sourceProductEventId: typeof body.sourceProductEventId === "string" ? body.sourceProductEventId : null,
      proposedOutput:
        body.proposedOutput && typeof body.proposedOutput === "object" && !Array.isArray(body.proposedOutput)
          ? (body.proposedOutput as Record<string, unknown>)
          : {},
      aiMetadata:
        body.aiMetadata && typeof body.aiMetadata === "object" && !Array.isArray(body.aiMetadata)
          ? (body.aiMetadata as Record<string, unknown>)
          : {},
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
      confirmationItems: Array.isArray(body.confirmationItems) ? (body.confirmationItems as any[]) : [],
    })

    if ("validationError" in result) {
      return NextResponse.json({ error: result.validationError }, { status: 400 })
    }
    if ("error" in result && result.error) {
      console.error("[foundation/verification-tasks POST] DB error:", result.error)
      return NextResponse.json({ error: "Failed to create verification task" }, { status: 500 })
    }

    return NextResponse.json({ verificationTask: result.verificationTask, duplicate: result.duplicate ?? false })
  } catch (error) {
    console.error("[foundation/verification-tasks POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
