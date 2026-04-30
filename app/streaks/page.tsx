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
    <div className="mx-auto grid max-w-4xl gap-4 p-6">
      <h1 className="text-3xl font-semibold">Streaks</h1>
      <StreakDashboardCard dashboard={dashboard.data?.dashboard} />
    </div>
  )
}
