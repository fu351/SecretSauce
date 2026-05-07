"use client"

import { StreakDashboardCard } from "@/components/streaks/streak-dashboard-card"
import { useStreakDashboard } from "@/hooks/use-streak-dashboard"
import { useFoundationFeatureFlag } from "@/hooks/use-feature-flag"
import { useFeaturePreferences } from "@/hooks/use-feature-preferences"

export default function StreaksPage() {
  const streaksFlag = useFoundationFeatureFlag("gamification_streaks")
  const preferences = useFeaturePreferences()
  const dashboard = useStreakDashboard(streaksFlag.isEnabled && preferences.preferences.streaksEnabled)

  if (!streaksFlag.isEnabled || !preferences.preferences.streaksEnabled) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Streaks are disabled</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enable streaks in settings to use this page.</p>
      </div>
    )
  }

  if (dashboard.isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p>Loading streak dashboard...</p>
      </div>
    )
  }

  if (dashboard.error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-destructive">Failed to load streak dashboard.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 pb-8 md:p-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Detailed page</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Cooking rhythm</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review your recent cooking history, confirm pending meals, and keep daily progress moving.
        </p>
      </div>
      <StreakDashboardCard dashboard={dashboard.data?.dashboard} />
    </div>
  )
}
