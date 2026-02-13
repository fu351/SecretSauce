/**
 * Admin authentication helpers
 * Check if users have admin or analyst roles
 */

import { createServerClient } from "@/lib/database/supabase-server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export type AdminRole = "admin" | "analyst"

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const accessToken =
    cookieStore.get("sb-access-token")?.value ??
    cookieStore.get("supabase-access-token")?.value ??
    cookieStore.get("supabase-auth-token")?.value ??
    null

  if (!accessToken) {
    return { user: null, errorMessage: "Missing access token cookie" }
  }

  const supabase = createServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken)

  return { user, errorMessage: error?.message ?? null }
}

/**
 * Check if a user has admin privileges
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServerClient()

  // Use RPC function in public schema (wrapper for ab_testing.is_admin)
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
  const supabase = createServerClient()

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
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from("ab_testing.admin_roles")
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
