import { createServerClient } from "@/lib/database/supabase"
import { redirect } from "next/navigation"

export type SubscriptionTier = "free" | "premium"

export interface UserSubscription {
  tier: SubscriptionTier | null
  started_at: string | null
  expires_at: string | null
  is_active: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

/**
 * Get the current user's subscription information
 * Server-side only
 */
export async function getUserSubscription(): Promise<UserSubscription | null> {
  const supabase = createServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "subscription_tier, subscription_started_at, subscription_expires_at, stripe_customer_id, stripe_subscription_id"
    )
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    console.error("Error fetching subscription:", profileError)
    return null
  }

  // Check if subscription is active (not expired)
  const isActive =
    profile.subscription_tier !== null &&
    (profile.subscription_expires_at === null ||
      new Date(profile.subscription_expires_at) > new Date())

  return {
    tier: profile.subscription_tier,
    started_at: profile.subscription_started_at,
    expires_at: profile.subscription_expires_at,
    is_active: isActive,
    stripe_customer_id: profile.stripe_customer_id,
    stripe_subscription_id: profile.stripe_subscription_id,
  }
}

/**
 * Require user to be authenticated
 * Redirects to sign-in if not authenticated
 */
export async function requireAuth(): Promise<string> {
  const supabase = createServerClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/signin")
  }

  return user.id
}

/**
 * Require user to have a specific subscription tier or higher
 * Redirects to sign-in if not authenticated
 * Redirects to upgrade page if tier is insufficient
 */
export async function requireTier(
  requiredTier: SubscriptionTier
): Promise<void> {
  // First ensure user is authenticated
  await requireAuth()

  const subscription = await getUserSubscription()

  // If no subscription or tier, treat as free tier
  const currentTier = subscription?.tier || "free"

  // Define tier hierarchy
  const tierLevels: Record<SubscriptionTier, number> = {
    free: 0,
    premium: 1,
  }

  const requiredLevel = tierLevels[requiredTier]
  const currentLevel = tierLevels[currentTier]

  // Check if subscription is active
  if (!subscription?.is_active && requiredTier !== "free") {
    redirect("/pricing?reason=expired")
  }

  // Check if user has required tier
  if (currentLevel < requiredLevel) {
    redirect(`/pricing?reason=tier&required=${requiredTier}`)
  }
}

/**
 * Check if user has access to a specific tier (doesn't redirect)
 * Server-side only
 */
export async function hasAccessToTier(
  requiredTier: SubscriptionTier
): Promise<boolean> {
  const subscription = await getUserSubscription()

  if (!subscription) {
    return requiredTier === "free"
  }

  const currentTier = subscription.tier || "free"

  const tierLevels: Record<SubscriptionTier, number> = {
    free: 0,
    premium: 1,
  }

  const requiredLevel = tierLevels[requiredTier]
  const currentLevel = tierLevels[currentTier]

  return subscription.is_active && currentLevel >= requiredLevel
}

/**
 * Get user's current tier level
 * Returns null if not authenticated
 */
export async function getUserTier(): Promise<SubscriptionTier | null> {
  const subscription = await getUserSubscription()

  if (!subscription || !subscription.is_active) {
    return null
  }

  return subscription.tier
}
