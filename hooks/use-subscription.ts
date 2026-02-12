"use client"

import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/database/supabase"
import { useEffect, useState } from "react"

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
 * Hook to get current user's subscription information
 * Client-side only
 */
export function useSubscription() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<UserSubscription | null>(
    null
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSubscription() {
      if (!user) {
        setSubscription(null)
        setLoading(false)
        return
      }

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select(
            "subscription_tier, subscription_started_at, subscription_expires_at, stripe_customer_id, stripe_subscription_id"
          )
          .eq("id", user.id)
          .single()

        if (error) {
          console.error("Error fetching subscription:", error)
          setSubscription(null)
        } else {
          // Check if subscription is active (not expired)
          const isActive =
            profile.subscription_tier !== null &&
            (profile.subscription_expires_at === null ||
              new Date(profile.subscription_expires_at) > new Date())

          setSubscription({
            tier: profile.subscription_tier,
            started_at: profile.subscription_started_at,
            expires_at: profile.subscription_expires_at,
            is_active: isActive,
            stripe_customer_id: profile.stripe_customer_id,
            stripe_subscription_id: profile.stripe_subscription_id,
          })
        }
      } catch (err) {
        console.error("Exception fetching subscription:", err)
        setSubscription(null)
      } finally {
        setLoading(false)
      }
    }

    fetchSubscription()
  }, [user])

  return { subscription, loading }
}

/**
 * Hook to check if user has access to a specific tier
 * Returns false for unauthenticated users or insufficient tier
 */
export function useHasAccess(requiredTier: SubscriptionTier) {
  const { subscription, loading } = useSubscription()

  if (loading) {
    return { hasAccess: false, loading: true }
  }

  if (!subscription) {
    // Unauthenticated users only have access to free tier
    return { hasAccess: requiredTier === "free", loading: false }
  }

  const currentTier = subscription.tier || "free"

  const tierLevels: Record<SubscriptionTier, number> = {
    free: 0,
    premium: 1,
  }

  const requiredLevel = tierLevels[requiredTier]
  const currentLevel = tierLevels[currentTier]

  const hasAccess = subscription.is_active && currentLevel >= requiredLevel

  return { hasAccess, loading: false }
}

/**
 * Hook to check if user is a paying customer (premium)
 */
export function useIsPaying() {
  const { subscription, loading } = useSubscription()

  const isPaying = subscription?.is_active && subscription.tier === "premium"

  return { isPaying, loading }
}

/**
 * Hook to get user's current tier
 */
export function useCurrentTier() {
  const { subscription, loading } = useSubscription()

  return {
    tier: subscription?.tier || "free",
    isActive: subscription?.is_active || false,
    loading,
  }
}
