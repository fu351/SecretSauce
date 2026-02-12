"use client"

/**
 * Analytics Hook
 *
 * Easy-to-use hook for tracking events in components
 * Automatically enriches events with user context
 */

import { useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useAnalyticsContext } from "@/contexts/analytics-context"
import type { AnalyticsEventName, EventProperties } from "@/lib/analytics"

type SubscriptionTier = "free" | "premium"

export function useAnalytics() {
  const { track: trackContext, sessionId } = useAnalyticsContext()
  const { user, profile } = useAuth()

  /**
   * Track an event with automatic user context enrichment
   */
  const trackEvent = useCallback(
    <T extends AnalyticsEventName>(
      eventName: T,
      properties?: EventProperties[T],
      options?: {
        experimentId?: string
        variantId?: string
        eventValue?: number
        immediate?: boolean
      }
    ) => {
      trackContext(eventName, properties, options)
    },
    [trackContext]
  )

  return {
    trackEvent,
    sessionId,
    userId: user?.id,
    userTier: (profile?.subscription_tier as SubscriptionTier) || "free",
    isAuthenticated: !!user,
  }
}
