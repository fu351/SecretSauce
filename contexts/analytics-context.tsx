"use client"

/**
 * Analytics Context Provider
 *
 * Provides analytics throughout the React component tree
 * - Manages session lifecycle
 * - Auto-tracks page views on route changes
 * - Identifies users when authenticated
 * - Flushes events on unmount/beforeunload
 */

import type React from "react"
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "./auth-context"
import { AnalyticsClient, SessionManager, EventQueue } from "@/lib/analytics"
import type { AnalyticsEventName, EventProperties } from "@/lib/analytics"

type SubscriptionTier = "free" | "premium"

interface AnalyticsContextType {
  sessionId: string
  track: <T extends AnalyticsEventName>(
    eventName: T,
    properties?: EventProperties[T],
    options?: {
      experimentId?: string
      variantId?: string
      eventValue?: number
      immediate?: boolean
    }
  ) => void
  identify: (userId: string, tier: SubscriptionTier) => void
  reset: () => void
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined)

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const pathname = usePathname()
  const [sessionId, setSessionId] = useState<string>("")
  const previousPath = useRef<string>("")
  const mounted = useRef(true)

  // Initialize analytics client and session on mount
  useEffect(() => {
    mounted.current = true

    // Initialize analytics
    AnalyticsClient.initialize()

    // Get session ID
    SessionManager.getSessionId().then((id) => {
      if (mounted.current) {
        setSessionId(id)
      }
    })

    return () => {
      mounted.current = false
    }
  }, [])

  // Track page views on route change
  useEffect(() => {
    if (pathname && pathname !== previousPath.current) {
      previousPath.current = pathname

      // Track page view
      AnalyticsClient.trackPageView(pathname, typeof document !== "undefined" ? document.title : undefined)
    }
  }, [pathname])

  // Identify user when authenticated
  useEffect(() => {
    if (user && profile) {
      const tier = (profile.subscription_tier as SubscriptionTier) || "free"
      AnalyticsClient.identify(user.id, tier)

      // Update session ID to user ID
      setSessionId(user.id)
    }
  }, [user, profile])

  // Flush events on unmount and page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      EventQueue.flush()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleBeforeUnload)
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", handleBeforeUnload)
      }
      EventQueue.flush()
    }
  }, [])

  // Track event wrapper
  const track = useCallback(
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
      AnalyticsClient.track(eventName, {
        properties,
        ...options,
      })
    },
    []
  )

  // Identify wrapper
  const identify = useCallback((userId: string, tier: SubscriptionTier) => {
    AnalyticsClient.identify(userId, tier)
    setSessionId(userId)
  }, [])

  // Reset wrapper
  const reset = useCallback(() => {
    AnalyticsClient.reset()

    // Generate new anonymous session
    SessionManager.getSessionId().then((id) => {
      if (mounted.current) {
        setSessionId(id)
      }
    })
  }, [])

  const value: AnalyticsContextType = {
    sessionId,
    track,
    identify,
    reset,
  }

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>
}

/**
 * Hook to access analytics context
 * Throws error if used outside AnalyticsProvider
 */
export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext)
  if (!context) {
    throw new Error("useAnalyticsContext must be used within AnalyticsProvider")
  }
  return context
}
