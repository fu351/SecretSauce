"use client"

import posthog from "posthog-js"
import { readCookieConsentFromDocument } from "@/lib/privacy/cookie-consent"

function hasAnalyticsConsent(): boolean {
  return readCookieConsentFromDocument()?.analytics ?? false
}

export function capturePosthogEvent(event: string, properties?: Record<string, unknown>) {
  if (!hasAnalyticsConsent()) return
  posthog.capture(event, properties)
}

export function identifyPosthogUser(distinctId: string, properties?: Record<string, unknown>) {
  if (!hasAnalyticsConsent()) return
  posthog.identify(distinctId, properties)
}

export function resetPosthogClient() {
  posthog.reset()
  if (typeof posthog.opt_out_capturing === "function") {
    posthog.opt_out_capturing()
  }
}

