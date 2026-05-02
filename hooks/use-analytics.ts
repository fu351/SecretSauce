"use client"

import { useCallback } from "react"
import { usePostHog } from "posthog-js/react"
import { useAuth } from "@/contexts/auth-context"
import { useCookieConsent } from "@/contexts/cookie-consent-context"
import type { AnalyticsEventName, EventProperties } from "@/lib/analytics"

type SubscriptionTier = "free" | "premium"

export function useAnalytics() {
  const posthog = usePostHog()
  const { user, profile } = useAuth()
  const { analyticsAllowed } = useCookieConsent()

  const trackEvent = useCallback(
    <T extends AnalyticsEventName>(
      eventName: T,
      properties?: EventProperties[T]
    ) => {
      if (!analyticsAllowed) return
      posthog?.capture(eventName, properties)
    },
    [analyticsAllowed, posthog]
  )

  return {
    trackEvent,
    userId: user?.id,
    userTier: (profile?.subscription_tier as SubscriptionTier) || "free",
    isAuthenticated: !!user,
  }
}
