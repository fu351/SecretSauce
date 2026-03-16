import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

// Explicit allowlist — only these fields may be written by the user.
// Identity, billing, and verification fields are intentionally omitted.
const USER_WRITABLE_FIELDS = new Set([
  "full_name",
  "avatar_url",
  "cooking_level",
  "budget_range",
  "dietary_preferences",
  "primary_goal",
  "cuisine_preferences",
  "cooking_time_preference",
  "zip_code",
  "grocery_distance_miles",
  "theme_preference",
  "tutorial_completed",
  "tutorial_completed_at",
  "tutorial_path",
  "formatted_address",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "country",
  "latitude",
  "longitude",
])

const PROFILE_SELECT = [
  "id", "email", "full_name", "clerk_user_id", "avatar_url",
  "created_at", "updated_at", "email_verified",
  "cooking_level", "budget_range", "dietary_preferences", "primary_goal",
  "cuisine_preferences", "cooking_time_preference", "zip_code", "grocery_distance_miles",
  "theme_preference", "tutorial_completed", "tutorial_completed_at", "tutorial_path",
  "formatted_address", "address_line1", "address_line2", "city", "state", "country",
  "latitude", "longitude",
  "subscription_tier", "subscription_status", "subscription_started_at",
  "subscription_expires_at", "stripe_customer_id", "stripe_subscription_id",
  "stripe_price_id", "stripe_current_period_end",
].join(", ")

export async function PATCH(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    // Build update from allowlist only — unknown/sensitive fields are silently dropped
    const safeUpdates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (USER_WRITABLE_FIELDS.has(key)) {
        safeUpdates[key] = value
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    const { data, error } = await supabase
      .from("profiles")
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq("clerk_user_id", clerkUserId)
      .select(PROFILE_SELECT)
      .single()

    if (error || !data) {
      console.error("[update-profile] Failed to update profile:", { clerkUserId, error })
      return NextResponse.json(
        { error: "Failed to update profile", detail: error?.message ?? "no rows returned" },
        { status: 500 }
      )
    }

    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("[update-profile] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
