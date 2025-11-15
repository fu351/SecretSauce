"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { MasteringCraftTutorial } from "@/components/tutorial/mastering-craft-tutorial"
import { OptimizeResourcesTutorial } from "@/components/tutorial/optimize-resources-tutorial"
import { ElevateJourneyTutorial } from "@/components/tutorial/elevate-journey-tutorial"
import { Card } from "@/components/ui/card"
import { useTheme } from "@/contexts/theme-context"
import clsx from "clsx"

type PrimaryGoal = "cooking" | "budgeting" | "both"

/**
 * Tutorial Get Started Page
 * Routes to the appropriate tutorial based on user's primary goal
 * Or redirects if not authenticated or already completed
 */
export default function TutorialPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { theme } = useTheme()
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null)
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false)

  const isDark = theme === "dark"

  useEffect(() => {
    // Check authentication and tutorial status
    if (loading) return

    if (!user) {
      // Not authenticated, redirect to login
      router.push("/auth/signin")
      return
    }

    if (profile?.tutorial_completed) {
      // Tutorial already completed, redirect to dashboard
      router.push("/dashboard")
      return
    }

    if (profile?.primary_goal) {
      // Map primary_goal to tutorial type
      const goal = profile.primary_goal as PrimaryGoal
      if (goal === "cooking" || goal === "budgeting" || goal === "both") {
        setPrimaryGoal(goal)
      }
    }

    setHasCheckedAuth(true)
  }, [user, profile, loading, router])

  if (loading || !hasCheckedAuth || !primaryGoal) {
    return (
      <div className={clsx(
        "min-h-screen flex items-center justify-center",
        isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"
      )}>
        <Card className={clsx(
          "p-8 shadow-lg",
          isDark ? "bg-card border-border" : "bg-white/90 border-0"
        )}>
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-opacity-20 animate-pulse">
              <div className={clsx(
                "w-8 h-8 rounded-full border-2 border-t-transparent animate-spin",
                isDark ? "border-primary" : "border-orange-500"
              )} />
            </div>
            <p className={clsx(
              "text-lg",
              isDark ? "text-foreground" : "text-gray-900"
            )}>
              Preparing your personalized tutorial...
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // Render the appropriate tutorial based on primary goal
  if (primaryGoal === "cooking") {
    return <MasteringCraftTutorial />
  }

  if (primaryGoal === "budgeting") {
    return <OptimizeResourcesTutorial />
  }

  if (primaryGoal === "both") {
    return <ElevateJourneyTutorial />
  }

  // Fallback
  return (
    <div className={clsx(
      "min-h-screen flex items-center justify-center",
      isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"
    )}>
      <Card className={clsx(
        "p-8 shadow-lg max-w-md",
        isDark ? "bg-card border-border" : "bg-white/90 border-0"
      )}>
        <div className="text-center space-y-4">
          <h2 className={clsx(
            "text-xl font-serif font-light",
            isDark ? "text-foreground" : "text-gray-900"
          )}>
            Unable to Load Tutorial
          </h2>
          <p className={clsx(
            "text-sm",
            isDark ? "text-muted-foreground" : "text-gray-600"
          )}>
            Please complete your onboarding profile to access the tutorial.
          </p>
          <button
            onClick={() => router.push("/onboarding")}
            className={clsx(
              "w-full px-4 py-2 rounded-lg font-medium transition-colors",
              isDark
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-orange-500 text-white hover:bg-orange-600"
            )}
          >
            Go to Onboarding
          </button>
        </div>
      </Card>
    </div>
  )
}
