import { NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { profileIdFromClerkUserId } from "@/lib/auth/clerk-profile-id"
import { normalizeUsername, validateUsername } from "@/lib/auth/username"
import { isAbortLikeError } from "@/lib/server/abort-error"

export const runtime = "nodejs"

const PROFILE_SELECT = [
  "id", "email", "full_name", "clerk_user_id", "avatar_url",
  "created_at", "updated_at", "email_verified",
  "cooking_level", "budget_range", "dietary_preferences", "primary_goal",
  "cuisine_preferences", "cooking_time_preference", "zip_code", "grocery_distance_miles",
  "meal_planner_weekly_reminder_enabled", "notification_email_digest_enabled", "notification_push_enabled",
  "theme_preference", "tutorial_completed", "tutorial_completed_at",
  "formatted_address", "address_line1", "address_line2", "city", "state", "country",
  "latitude", "longitude",
  "full_name_hidden",
  "username",
  "subscription_tier", "subscription_status", "subscription_started_at",
  "subscription_expires_at", "stripe_customer_id", "stripe_subscription_id",
  "stripe_price_id", "stripe_current_period_end",
].join(", ")

async function readOptionalJson(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getPrimaryEmailAddress(clerkUser: any): string | null {
  const primaryId = clerkUser?.primaryEmailAddressId
  const email = clerkUser?.emailAddresses?.find(
    (item: any) => item?.id === primaryId
  )?.emailAddress
  return typeof email === "string" ? email : null
}

function getEmailVerified(clerkUser: any): boolean | null {
  const primaryId = clerkUser?.primaryEmailAddressId
  const record = clerkUser?.emailAddresses?.find(
    (item: any) => item?.id === primaryId
  )
  const status = record?.verification?.status
  if (typeof status !== "string") return null
  return status === "verified"
}

function getFullName(clerkUser: any): string | null {
  const direct = clerkUser?.fullName
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim()
  }

  const firstName = clerkUser?.firstName ?? ""
  const lastName = clerkUser?.lastName ?? ""
  const joined = `${firstName} ${lastName}`.trim()
  return joined.length > 0 ? joined : null
}

function getUsernameFromClerkUser(clerkUser: any): string | null {
  const direct = clerkUser?.username
  if (typeof direct === "string" && direct.trim().length > 0) {
    return normalizeUsername(direct)
  }

  const unsafeMetadataUsername =
    clerkUser?.unsafeMetadata?.username ??
    clerkUser?.unsafe_metadata?.username

  if (typeof unsafeMetadataUsername === "string" && unsafeMetadataUsername.trim().length > 0) {
    return normalizeUsername(unsafeMetadataUsername)
  }

  return null
}

export async function POST(req: Request) {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)
    const body = await readOptionalJson(req)
    const email = getPrimaryEmailAddress(clerkUser)
    if (!email) {
      return NextResponse.json(
        { error: "Missing primary Clerk email" },
        { status: 400 }
      )
    }

    const supabase = createServiceSupabaseClient()
    const fullName = getFullName(clerkUser)
    const avatarUrl = clerkUser?.imageUrl ?? null
    const emailVerified = getEmailVerified(clerkUser)
    const requestedUsername =
      typeof body.username === "string" && body.username.trim().length > 0
        ? normalizeUsername(body.username)
        : getUsernameFromClerkUser(clerkUser)
    const nowIso = new Date().toISOString()

    if (requestedUsername) {
      const usernameError = validateUsername(requestedUsername)
      if (usernameError) {
        return NextResponse.json({ error: usernameError }, { status: 400 })
      }
    }

    const baseUpdate = {
      clerk_user_id: clerkUserId,
      email,
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: nowIso,
    } as Record<string, string | boolean | null>

    if (emailVerified !== null) {
      baseUpdate.email_verified = emailVerified
    }
    if (requestedUsername) {
      baseUpdate.username = requestedUsername
    }

    const { data: byClerk, error: byClerkError } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (byClerk?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("profiles")
        .update(baseUpdate)
        .eq("id", byClerk.id)
        .select(PROFILE_SELECT)
        .single()
      if (updateError?.code === "23505") {
        return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
      }
      return NextResponse.json({ profile: updated ?? { id: byClerk.id, email, created_at: byClerk.created_at ?? null } })
    }

    const { data: byEmail, error: byEmailError } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .eq("email", email)
      .maybeSingle()

    if (byEmail?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("profiles")
        .update(baseUpdate)
        .eq("id", byEmail.id)
        .select(PROFILE_SELECT)
        .single()
      if (updateError?.code === "23505") {
        return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
      }
      return NextResponse.json({ profile: updated ?? { id: byEmail.id, email: byEmail.email, created_at: byEmail.created_at ?? null } })
    }

    if (!requestedUsername) {
      return NextResponse.json(
        { error: "Username is required to finish sign up" },
        { status: 400 }
      )
    }

    const profileId = profileIdFromClerkUserId(clerkUserId)
    const createPayload = {
      id: profileId,
      email,
      clerk_user_id: clerkUserId,
      full_name: fullName,
      avatar_url: avatarUrl,
      username: requestedUsername,
      email_verified: emailVerified,
      created_at: nowIso,
      updated_at: nowIso,
    }

    const { data: created, error: createError } = await supabase
      .from("profiles")
      .upsert(createPayload, { onConflict: "id" })
      .select(PROFILE_SELECT)
      .single()

    // Race condition: another concurrent request already created this profile.
    // Fall back to fetching the existing row by clerk_user_id.
    if (createError?.code === "23505") {
      if (typeof createError.message === "string" && createError.message.includes("username")) {
        return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
      }
      const { data: existing } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle()

      if (existing?.id) {
        return NextResponse.json({ profile: existing })
      }
    }

    if (createError || !created) {
      console.error("[ensure-profile] Failed creating deterministic profile", {
        clerkUserId,
        createError,
      })
      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      )
    }

    return NextResponse.json({ profile: created })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return new NextResponse(null, { status: 204 })
    }

    console.error("[ensure-profile] Unexpected error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
