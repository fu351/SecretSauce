import { NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { profileIdFromClerkUserId } from "@/lib/auth/clerk-profile-id"

export const runtime = "nodejs"

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

export async function POST() {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)
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
    const nowIso = new Date().toISOString()

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

    const { data: byClerk, error: byClerkError } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (byClerk?.id) {
      await supabase.from("profiles").update(baseUpdate).eq("id", byClerk.id)
      return NextResponse.json({
        profile: {
          id: byClerk.id,
          email: email,
          created_at: byClerk.created_at ?? null,
        },
      })
    }

    const { data: byEmail, error: byEmailError } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .eq("email", email)
      .maybeSingle()

    if (byEmail?.id) {
      await supabase.from("profiles").update(baseUpdate).eq("id", byEmail.id)
      return NextResponse.json({
        profile: {
          id: byEmail.id,
          email: byEmail.email,
          created_at: byEmail.created_at ?? null,
        },
      })
    }

    const profileId = profileIdFromClerkUserId(clerkUserId)
    const createPayload = {
      id: profileId,
      email,
      clerk_user_id: clerkUserId,
      full_name: fullName,
      avatar_url: avatarUrl,
      email_verified: emailVerified,
      created_at: nowIso,
      updated_at: nowIso,
    }

    const { data: created, error: createError } = await supabase
      .from("profiles")
      .upsert(createPayload, { onConflict: "id" })
      .select("id, email, created_at")
      .single()

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

    return NextResponse.json({
      profile: {
        id: created.id,
        email: created.email,
        created_at: created.created_at ?? null,
      },
    })
  } catch (error) {
    console.error("[ensure-profile] Unexpected error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

