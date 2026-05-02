/**
 * Admin authentication helpers
 * Check if users have admin or analyst roles
 */

import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { auth as clerkAuth, clerkClient } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export type AdminRole = "admin" | "analyst"

async function getAuthenticatedUser() {
  const supabase = createServiceSupabaseClient()
  const state = await clerkAuth()

  if (!state.userId) {
    return { user: null, errorMessage: "Missing Clerk session" }
  }

  const { data: byClerkId } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", state.userId)
    .maybeSingle()

  if (byClerkId?.id) {
    return { user: { id: byClerkId.id }, errorMessage: null }
  }

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(state.userId)
  const primaryEmailId = clerkUser.primaryEmailAddressId
  const primaryEmail = clerkUser.emailAddresses.find(
    (entry) => entry.id === primaryEmailId
  )?.emailAddress

  if (!primaryEmail) {
    return { user: null, errorMessage: "Missing Clerk primary email" }
  }

  const { data: byEmail } = await supabase
    .from("profiles")
    .select("id, clerk_user_id")
    .eq("email", primaryEmail)
    .maybeSingle()

  if (!byEmail?.id) {
    return { user: null, errorMessage: "No profile linked to Clerk user" }
  }

  if (byEmail.clerk_user_id !== state.userId) {
    await supabase
      .from("profiles")
      .update({
        clerk_user_id: state.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", byEmail.id)
  }

  return { user: { id: byEmail.id }, errorMessage: null }
}

/**
 * Resolve the current authenticated profile ID without enforcing admin access.
 * Returns null when there is no linked profile.
 */
export async function resolveAuthenticatedProfileId(): Promise<string | null> {
  const { user } = await getAuthenticatedUser()
  return user?.id ?? null
}

/**
 * Check if a user has admin privileges
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient()

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "is_admin",
    {
      p_user_id: userId,
    }
  )

  console.log("[isAdmin] RPC result:", { rpcData, rpcError, userId })

  if (rpcError) {
    console.error("Error checking admin status:", rpcError)
    return false
  }

  return rpcData === true
}

/**
 * Check if a user can view analytics (admin or analyst)
 */
export async function canViewAnalytics(userId: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase.rpc("can_view_analytics", {
    p_user_id: userId,
  })

  if (error) {
    console.error("Error checking analytics permission:", error)
    return false
  }

  return data === true
}

/**
 * Get user's admin role if they have one
 */
export async function getAdminRole(userId: string): Promise<AdminRole | null> {
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .single()

  if (error || !data) {
    return null
  }

  return data.role as AdminRole
}

/**
 * Require admin access - redirects to home if not admin
 * Use this at the top of admin-only pages
 */
export async function requireAdmin(): Promise<void> {
  const { user, errorMessage } = await getAuthenticatedUser()

  console.log("[requireAdmin] User check:", {
    hasUser: !!user,
    userId: user?.id,
    error: errorMessage,
  })

  if (errorMessage || !user) {
    console.log("[requireAdmin] No user, redirecting to signin")
    redirect("/auth/signin")
  }

  const isUserAdmin = await isAdmin(user.id)

  console.log("[requireAdmin] Admin check:", {
    userId: user.id,
    isAdmin: isUserAdmin
  })

  if (!isUserAdmin) {
    console.log("[requireAdmin] Not admin, redirecting to home")
    redirect("/")
  }

  console.log("[requireAdmin] Access granted")
}

/**
 * Require analytics access (admin or analyst)
 */
export async function requireAnalytics(): Promise<void> {
  const { user, errorMessage } = await getAuthenticatedUser()

  if (errorMessage || !user) {
    redirect("/auth/signin")
  }

  const hasAccess = await canViewAnalytics(user.id)

  if (!hasAccess) {
    redirect("/")
  }
}

/**
 * Get current user and verify they're an admin
 * Returns user or redirects
 */
export async function getAdminUser() {
  const { user, errorMessage } = await getAuthenticatedUser()

  if (errorMessage || !user) {
    redirect("/auth/signin")
  }

  const isUserAdmin = await isAdmin(user.id)

  if (!isUserAdmin) {
    redirect("/")
  }

  return user
}
