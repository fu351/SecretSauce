"use client"

import { useHasAccess, SubscriptionTier } from "@/hooks/use-subscription"
import { useAuth } from "@/contexts/auth-context"
import { useAnalytics } from "@/hooks/use-analytics"
import Link from "next/link"
import { Lock, Loader2, LogIn } from "lucide-react"
import { useEffect, useState } from "react"

interface TierGateProps {
  requiredTier: SubscriptionTier
  children: React.ReactNode
  fallback?: React.ReactNode
  showPaywall?: boolean
}

/**
 * Component that gates content behind a subscription tier
 * Shows paywall or custom fallback if user doesn't have access
 */
export function TierGate({
  requiredTier,
  children,
  fallback,
  showPaywall = true,
}: TierGateProps) {
  const { user } = useAuth()
  const { hasAccess, loading } = useHasAccess(requiredTier)
  const { trackEvent } = useAnalytics()

  // Track when tier gate blocks access
  useEffect(() => {
    if (!loading && !hasAccess) {
      trackEvent("tier_gate_shown", {
        required_tier: requiredTier,
        page_url: window.location.pathname,
      })
    }
  }, [loading, hasAccess, requiredTier, trackEvent])

  if (loading) {
    return (
      <FullPageGateShell>
        <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
      </FullPageGateShell>
    )
  }

  if (hasAccess) {
    return <>{children}</>
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>
  }

  // Show paywall if user is authenticated but lacks tier
  if (showPaywall && user) {
    return <Paywall requiredTier={requiredTier} />
  }

  // Show sign-in prompt if user is not authenticated
  if (!user) {
    return <SignInPrompt />
  }

  return null
}

function FullPageGateShell({ children }: { children: React.ReactNode }) {
  const [headerHeight, setHeaderHeight] = useState(0)

  useEffect(() => {
    const measureHeader = () => {
      const header = document.querySelector("header")
      setHeaderHeight(header instanceof HTMLElement ? header.offsetHeight : 0)
    }

    measureHeader()
    window.addEventListener("resize", measureHeader)

    return () => {
      window.removeEventListener("resize", measureHeader)
    }
  }, [])

  return (
    <div
      className="flex items-center justify-center p-4 md:p-6"
      style={{ minHeight: `calc(100dvh - ${headerHeight}px)` }}
    >
      {children}
    </div>
  )
}

/**
 * Paywall component shown when user lacks required tier
 */
function Paywall({ requiredTier }: { requiredTier: SubscriptionTier }) {
  const { trackEvent } = useAnalytics()

  const tierNames: Record<SubscriptionTier, string> = {
    free: "Free",
    premium: "Premium",
  }

  const tierDescriptions: Record<SubscriptionTier, string> = {
    free: "Create an account to access this feature",
    premium: "Upgrade to Premium to unlock this feature",
  }

  const handleUpgradeClick = () => {
    trackEvent("upgrade_button_clicked", {
      source: "tier_gate",
      required_tier: requiredTier,
    })
  }

  return (
    <FullPageGateShell>
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card p-8 text-center md:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, hsl(var(--foreground) / 0.18) 1px, transparent 0)",
              backgroundSize: "34px 34px",
            }}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />

        <div className="relative">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mb-2 text-2xl font-serif font-light tracking-tight text-foreground">
            {tierNames[requiredTier]} Feature
          </h3>
          <p className="mb-7 text-sm text-muted-foreground md:text-base">
            {tierDescriptions[requiredTier]}
          </p>
          <Link
            href={`/pricing?required=${requiredTier}`}
            onClick={handleUpgradeClick}
            className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Upgrade to {tierNames[requiredTier]}
          </Link>
        </div>
      </div>
    </FullPageGateShell>
  )
}

/**
 * Sign-in prompt for unauthenticated users
 */
function SignInPrompt() {
  const { trackEvent } = useAnalytics()

  const handleSignInClick = () => {
    trackEvent("signin_button_clicked", {
      source: "auth_gate",
    })
  }

  return (
    <FullPageGateShell>
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card p-8 text-center md:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, hsl(var(--foreground) / 0.18) 1px, transparent 0)",
              backgroundSize: "34px 34px",
            }}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />

        <div className="relative">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mb-2 text-2xl font-serif font-light tracking-tight text-foreground">
            Sign In Required
          </h3>
          <p className="mb-7 text-sm text-muted-foreground md:text-base">
            Please sign in to access this feature
          </p>
          <Link
            href="/auth/signin"
            onClick={handleSignInClick}
            className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign In
          </Link>
        </div>
      </div>
    </FullPageGateShell>
  )
}

/**
 * Component that requires user to be authenticated (any tier including free)
 * Shows sign-in prompt if not logged in
 */
export function AuthGate({
  children,
  fallback,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const { trackEvent } = useAnalytics()

  // Track when auth gate blocks access
  useEffect(() => {
    if (!loading && !user) {
      trackEvent("auth_gate_shown", {
        page_url: window.location.pathname,
      })
    }
  }, [loading, user, trackEvent])

  if (loading) {
    return (
      <FullPageGateShell>
        <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
      </FullPageGateShell>
    )
  }

  if (user) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return <SignInPrompt />
}

/**
 * Component that shows content ONLY when user is logged in
 * Hides content if not logged in (no fallback shown)
 */
export function ShowWhenLoggedIn({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return <>{children}</>
  }

  return null
}

/**
 * Component that shows content ONLY when user is logged out
 * Hides content if logged in
 */
export function ShowWhenLoggedOut({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (!user) {
    return <>{children}</>
  }

  return null
}

/**
 * Inline tier badge component
 */
export function TierBadge({ tier }: { tier: SubscriptionTier }) {
  const tierColors: Record<SubscriptionTier, string> = {
    free: "bg-secondary text-secondary-foreground border-border",
    premium: "bg-primary/10 text-primary border-primary/30",
  }

  const tierNames: Record<SubscriptionTier, string> = {
    free: "Free",
    premium: "Premium",
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tierColors[tier]}`}
    >
      {tier !== "free" && <Lock className="h-3 w-3" />}
      {tierNames[tier]}
    </span>
  )
}
