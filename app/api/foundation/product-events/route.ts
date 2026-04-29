import { NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import {
  isDuplicateDatabaseError,
  isJsonObject,
  isProductEventType,
} from "@/lib/foundation/product-events"

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
      .from("product_events")
      .select("*")
      .eq("actor_profile_id", profile.profileId)
      .order("occurred_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[foundation/product-events GET] DB error:", error)
      return NextResponse.json({ error: "Failed to load product events" }, { status: 500 })
    }

    return NextResponse.json({ events: data ?? [] })
  } catch (error) {
    console.error("[foundation/product-events GET] Unexpected error:", error)
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

    if (!isProductEventType(body.eventType)) {
      return NextResponse.json({ error: "Unsupported product event type" }, { status: 400 })
    }

    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : null

    if (!idempotencyKey) {
      return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 })
    }

    const metadata = isJsonObject(body.metadata) ? body.metadata : {}

    const insertPayload = {
      actor_profile_id: profile.profileId,
      event_type: body.eventType,
      source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "server",
      idempotency_key: idempotencyKey,
      entity_type: typeof body.entityType === "string" ? body.entityType : null,
      entity_id: typeof body.entityId === "string" ? body.entityId : null,
      metadata,
    }

    const { data, error } = await (profile.supabase as any)
      .from("product_events")
      .insert(insertPayload)
      .select("*")
      .single()

    if (isDuplicateDatabaseError(error)) {
      const { data: existing, error: lookupError } = await (profile.supabase as any)
        .from("product_events")
        .select("*")
        .eq("actor_profile_id", profile.profileId)
        .eq("event_type", body.eventType)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

      if (lookupError || !existing) {
        console.error("[foundation/product-events POST] Duplicate lookup failed:", lookupError)
        return NextResponse.json({ error: "Failed to resolve duplicate event" }, { status: 500 })
      }

      return NextResponse.json({ event: existing, duplicate: true })
    }

    if (error) {
      console.error("[foundation/product-events POST] DB error:", error)
      return NextResponse.json({ error: "Failed to record product event" }, { status: 500 })
    }

    return NextResponse.json({ event: data, duplicate: false })
  } catch (error) {
    console.error("[foundation/product-events POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
