"use client"

import { SpeedInsights } from "@vercel/speed-insights/next"
import { useCookieConsent } from "@/contexts/cookie-consent-context"

export function SpeedInsightsGate() {
  const { analyticsAllowed } = useCookieConsent()

  if (!analyticsAllowed) return null

  return <SpeedInsights />
}

