/**
 * Development helper utilities
 * Useful functions for debugging and testing
 */

import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

/**
 * Grant admin role to a user
 */
export async function grantAdminRole(
  userId: string,
  role: "admin" | "analyst" = "admin",
  grantedBy?: string
) {
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase
    .from("admin_roles")
    .insert({
      user_id: userId,
      role,
      granted_by: grantedBy || userId,
    })
    .select()
    .single()

  if (error) {
    console.error("Error granting admin role:", error)
    return { success: false, error }
  }

  return { success: true, data }
}

/**
 * Revoke admin role from a user
 */
export async function revokeAdminRole(userId: string, role: "admin" | "analyst" = "admin") {
  const supabase = createServiceSupabaseClient()

  const { error } = await supabase
    .from("admin_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("role", role)
    .is("revoked_at", null)

  if (error) {
    console.error("Error revoking admin role:", error)
    return { success: false, error }
  }

  return { success: true }
}

/**
 * Update user subscription tier
 */
export async function updateUserTier(
  userId: string,
  tier: "free" | "premium",
  durationDays?: number
) {
  const supabase = createServiceSupabaseClient()

  const updates: any = {
    subscription_tier: tier,
    subscription_started_at: new Date().toISOString(),
  }

  if (durationDays) {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + durationDays)
    updates.subscription_expires_at = expiresAt.toISOString()
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)

  if (error) {
    console.error("Error updating user tier:", error)
    return { success: false, error }
  }

  return { success: true }
}

/**
 * Get all users with a specific subscription tier
 */
export async function getUsersByTier(tier: "free" | "premium") {
  const supabase = createServiceSupabaseClient()

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_tier, created_at")
    .eq("subscription_tier", tier)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching users:", error)
    return { success: false, error, users: [] }
  }

  return { success: true, users: data || [] }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const supabase = createServiceSupabaseClient()

  const [users, recipes] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("recipes").select("*", { count: "exact", head: true }),
  ])

  return {
    userCount: users.count || 0,
    recipeCount: recipes.count || 0,
  }
}

/**
 * Seed development data (use with caution!)
 */
export async function seedDevData() {
  console.warn("seedDevData not implemented yet")
  return { success: false, error: "Not implemented" }
}
