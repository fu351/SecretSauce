"use client"

import { useEffect, useState } from "react"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useAuth } from "./auth-context"
import { useCookieConsent } from "@/contexts/cookie-consent-context"
import { resetPosthogClient } from "@/lib/analytics/posthog-client"

function PostHogPageView({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthogClient = usePostHog()

  useEffect(() => {
    if (enabled && pathname && posthogClient) {
      const url = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`
      posthogClient.capture("$pageview", { $current_url: url })
    }
  }, [enabled, pathname, searchParams, posthogClient])

  return null
}

function PostHogIdentify({ enabled }: { enabled: boolean }) {
  const { user, profile, loading } = useAuth()
  const posthogClient = usePostHog()

  useEffect(() => {
    if (!enabled || loading || !posthogClient) return

    if (user) {
      posthogClient.identify(user.id, {
        email: user.email,
        subscription_tier: profile?.subscription_tier ?? "free",
      })
    } else {
      posthogClient.reset()
    }
  }, [enabled, user, profile, loading, posthogClient])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { analyticsAllowed } = useCookieConsent()
  const [analyticsReady, setAnalyticsReady] = useState(false)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"

    if (!key) return

    if (!analyticsAllowed) {
      if (analyticsReady) {
        resetPosthogClient()
        setAnalyticsReady(false)
      }
      return
    }

    if (analyticsReady) return

    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // handled manually via PostHogPageView
      capture_pageleave: true,
      person_profiles: "identified_only",
    })
    setAnalyticsReady(true)
  }, [analyticsAllowed, analyticsReady])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView enabled={analyticsAllowed && analyticsReady} />
      </Suspense>
      <PostHogIdentify enabled={analyticsAllowed && analyticsReady} />
      {children}
    </PHProvider>
  )
}
