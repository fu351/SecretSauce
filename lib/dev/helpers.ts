/**
 * Development helper utilities
 * Useful functions for debugging and testing
 */

import { createServerClient } from "@/lib/database/supabase"

/**
 * Grant admin role to a user
 */
export async function grantAdminRole(
  userId: string,
  role: "admin" | "analyst" = "admin",
  grantedBy?: string
) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from("ab_testing.admin_roles")
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
  const supabase = createServerClient()

  const { error } = await supabase
    .from("ab_testing.admin_roles")
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
  const supabase = createServerClient()

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
 * Create a simple feature flag (experiment with one variant)
 */
export async function createFeatureFlag(params: {
  name: string
  description?: string
  targetTiers: ("free" | "premium")[]
  targetAnonymous?: boolean
  config: Record<string, any>
  createdBy: string
}) {
  const supabase = createServerClient()

  // Create experiment
  const { data: experiment, error: expError } = await supabase
    .from("ab_testing.experiments")
    .insert({
      name: params.name,
      description: params.description,
      status: "active",
      allocation_method: "random",
      traffic_percentage: 100,
      target_user_tiers: params.targetTiers,
      target_anonymous: params.targetAnonymous ?? false,
      created_by: params.createdBy,
    })
    .select()
    .single()

  if (expError) {
    console.error("Error creating experiment:", expError)
    return { success: false, error: expError }
  }

  // Create single variant
  const { data: variant, error: varError } = await supabase
    .from("ab_testing.variants")
    .insert({
      experiment_id: experiment.id,
      name: "Enabled",
      is_control: true,
      weight: 100,
      config: params.config,
    })
    .select()
    .single()

  if (varError) {
    console.error("Error creating variant:", varError)
    return { success: false, error: varError }
  }

  return { success: true, experiment, variant }
}

/**
 * Get all users with a specific subscription tier
 */
export async function getUsersByTier(tier: "free" | "premium") {
  const supabase = createServerClient()

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
 * Get experiment analytics summary
 */
export async function getExperimentAnalytics(experimentId: string) {
  const supabase = createServerClient()

  const { data, error } = await supabase.rpc("ab_testing.get_experiment_results", {
    p_experiment_id: experimentId,
  })

  if (error) {
    console.error("Error fetching analytics:", error)
    return { success: false, error, results: [] }
  }

  return { success: true, results: data || [] }
}

/**
 * Clear all user assignments for an experiment (useful for testing)
 */
export async function clearExperimentAssignments(experimentId: string) {
  const supabase = createServerClient()

  const { error } = await supabase
    .from("ab_testing.user_assignments")
    .delete()
    .eq("experiment_id", experimentId)

  if (error) {
    console.error("Error clearing assignments:", error)
    return { success: false, error }
  }

  return { success: true }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const supabase = createServerClient()

  const [users, recipes, experiments, events] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("recipes").select("*", { count: "exact", head: true }),
    supabase.from("ab_testing.experiments").select("*", { count: "exact", head: true }),
    supabase.from("ab_testing.events").select("*", { count: "exact", head: true }),
  ])

  return {
    userCount: users.count || 0,
    recipeCount: recipes.count || 0,
    experimentCount: experiments.count || 0,
    eventCount: events.count || 0,
  }
}

/**
 * Seed development data (use with caution!)
 */
export async function seedDevData() {
  // TODO: Implement dev data seeding
  // This could create sample users, recipes, experiments, etc.
  console.warn("seedDevData not implemented yet")
  return { success: false, error: "Not implemented" }
}
