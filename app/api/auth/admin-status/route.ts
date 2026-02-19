import { NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

async function getPrimaryEmailAddress(clerkUser: any): Promise<string | null> {
  const primaryEmailId = clerkUser?.primaryEmailAddressId
  const primaryEmail = clerkUser?.emailAddresses?.find(
    (entry: any) => entry?.id === primaryEmailId
  )?.emailAddress

  return typeof primaryEmail === "string" ? primaryEmail : null
}

async function resolveProfileId(clerkUserId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient()

  const { data: byClerkId } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (byClerkId?.id) {
    return byClerkId.id
  }

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkUserId)
  const email = await getPrimaryEmailAddress(clerkUser)
  if (!email) return null

  const { data: byEmail } = await supabase
    .from("profiles")
    .select("id, clerk_user_id")
    .eq("email", email)
    .maybeSingle()

  if (!byEmail?.id) return null

  if (byEmail.clerk_user_id !== clerkUserId) {
    await supabase
      .from("profiles")
      .update({
        clerk_user_id: clerkUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", byEmail.id)
  }

  return byEmail.id
}

export async function GET() {
  try {
    const authState = await auth()
    const clerkUserId = authState.userId ?? null

    if (!clerkUserId) {
      return NextResponse.json({ isAdmin: false, canViewAnalytics: false })
    }

    const profileId = await resolveProfileId(clerkUserId)
    if (!profileId) {
      return NextResponse.json({ isAdmin: false, canViewAnalytics: false })
    }

    const supabase = createServiceSupabaseClient()

    const [{ data: isAdmin, error: isAdminError }, { data: canViewAnalytics, error: analyticsError }] =
      await Promise.all([
        supabase.rpc("is_admin", { p_user_id: profileId }),
        supabase.rpc("can_view_analytics", { p_user_id: profileId }),
      ])

    if (isAdminError) {
      console.error("[admin-status] is_admin rpc error:", isAdminError)
    }

    if (analyticsError) {
      console.error("[admin-status] can_view_analytics rpc error:", analyticsError)
    }

    return NextResponse.json({
      isAdmin: isAdmin === true,
      canViewAnalytics: canViewAnalytics === true,
    })
  } catch (error) {
    console.error("[admin-status] unexpected error:", error)
    return NextResponse.json(
      { isAdmin: false, canViewAnalytics: false },
      { status: 500 }
    )
  }
}

