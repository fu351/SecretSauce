import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

async function resolveProfileId(clerkUserId: string) {
  const supabase = createServiceSupabaseClient()
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()
  return { supabase, profileId: data?.id ?? null }
}

function normalizeSubscriptionPayload(body: unknown) {
  if (!body || typeof body !== "object") return null
  const candidate = body as {
    subscription?: { endpoint?: unknown; keys?: { auth?: unknown; p256dh?: unknown } }
    endpoint?: unknown
  }

  const subscription = candidate.subscription
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : typeof candidate.endpoint === "string" ? candidate.endpoint : null
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : null
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : null

  if (!endpoint || !auth || !p256dh) return null

  return {
    endpoint,
    subscription: subscription ?? body,
  }
}

export async function POST(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { supabase, profileId } = await resolveProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    const normalized = normalizeSubscriptionPayload(body)
    if (!normalized) {
      return NextResponse.json({ error: "A valid push subscription is required" }, { status: 400 })
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        recipient_id: profileId,
        endpoint: normalized.endpoint,
        subscription: normalized.subscription,
        user_agent: req.headers.get("user-agent"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )

    if (error) {
      console.error("[push-subscriptions POST] failed to upsert subscription:", error)
      return NextResponse.json({ error: "Failed to save push subscription" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }
    console.error("[push-subscriptions POST] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { supabase, profileId } = await resolveProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    const endpoint =
      body && typeof body === "object" && typeof (body as { endpoint?: unknown }).endpoint === "string"
        ? (body as { endpoint: string }).endpoint
        : null

    if (!endpoint) {
      return NextResponse.json({ error: "endpoint is required" }, { status: 400 })
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("recipient_id", profileId)
      .eq("endpoint", endpoint)

    if (error) {
      console.error("[push-subscriptions DELETE] failed to delete subscription:", error)
      return NextResponse.json({ error: "Failed to delete push subscription" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }
    console.error("[push-subscriptions DELETE] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
