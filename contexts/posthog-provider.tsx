"use client"

import { useEffect } from "react"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useAuth } from "./auth-context"

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthogClient = usePostHog()

  useEffect(() => {
    if (pathname && posthogClient) {
      const url = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`
      posthogClient.capture("$pageview", { $current_url: url })
    }
  }, [pathname, searchParams, posthogClient])

  return null
}

function PostHogIdentify() {
  const { user, profile, loading } = useAuth()
  const posthogClient = usePostHog()

  useEffect(() => {
    if (loading || !posthogClient) return

    if (user) {
      posthogClient.identify(user.id, {
        email: user.email,
        subscription_tier: profile?.subscription_tier ?? "free",
      })
    } else {
      posthogClient.reset()
    }
  }, [user, profile, loading, posthogClient])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"

    if (!key) return

    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // handled manually via PostHogPageView
      capture_pageleave: true,
      person_profiles: "identified_only",
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PHProvider>
  )
}
