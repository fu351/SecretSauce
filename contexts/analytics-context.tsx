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
import { createContext, useContext, useEffect, useState, useCallback, useRef, Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
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

function AnalyticsRouteTracker({ onRouteChange }: { onRouteChange: (url: string) => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const currentUrl = pathname ? `${pathname}${queryString ? `?${queryString}` : ""}` : ""

  useEffect(() => {
    onRouteChange(currentUrl)
  }, [currentUrl, onRouteChange])

  return null
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const [sessionId, setSessionId] = useState<string>("")
  const previousUrl = useRef<string>("")
  const mounted = useRef(true)

  const handleRouteChange = useCallback((url: string) => {
    if (!url || url === previousUrl.current) {
      return
    }

    previousUrl.current = url
    AnalyticsClient.trackPageView(url, typeof document !== "undefined" ? document.title : undefined)
  }, [])

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

  return (
    <AnalyticsContext.Provider value={value}>
      <Suspense fallback={null}>
        <AnalyticsRouteTracker onRouteChange={handleRouteChange} />
      </Suspense>
      {children}
    </AnalyticsContext.Provider>
  )
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
