"use client"

import { BudgetDashboardCard } from "@/components/budget/budget-dashboard-card"
import { BudgetNudgeCard } from "@/components/budget/budget-nudge-card"
import { BudgetSetupCard } from "@/components/budget/budget-setup-card"
import { BudgetSourceBreakdown } from "@/components/budget/budget-source-breakdown"
import { BudgetSpendQuickAdd } from "@/components/budget/budget-spend-quick-add"
import { BudgetSwitchGoalDialog } from "@/components/budget/budget-switch-goal-dialog"
import { BudgetWeeklyWrapCard } from "@/components/budget/budget-weekly-wrap-card"
import { useBudgetDashboard } from "@/hooks/use-budget-dashboard"
import { useFoundationFeatureFlag } from "@/hooks/use-feature-flag"
import { useFeaturePreferences } from "@/hooks/use-feature-preferences"

export default function BudgetPage() {
  const budgetFlag = useFoundationFeatureFlag("budget_tracking")
  const preferences = useFeaturePreferences()
  const dashboard = useBudgetDashboard(budgetFlag.isEnabled && preferences.preferences.budgetTrackingEnabled)

  if (!budgetFlag.isEnabled || !preferences.preferences.budgetTrackingEnabled) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Budget tracking is disabled</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enable budget tracking in settings to use this page.</p>
      </div>
    )
  }

  if (dashboard.isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p>Loading budget dashboard...</p>
      </div>
    )
  }

  if (dashboard.error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-destructive">Failed to load budget dashboard.</p>
      </div>
    )
  }

  const payload = dashboard.data?.dashboard
  const activeGoal = payload?.activeGoal
  const currentWeekSummary = payload?.currentWeek?.summary
  const currentWeekStartDate = payload?.currentWeek?.weekStartDate

  return (
    <div className="mx-auto grid max-w-4xl gap-4 p-6">
      <h1 className="text-3xl font-semibold">Budget Tracking</h1>
      {!activeGoal ? (
        <BudgetSetupCard />
      ) : (
        <>
          <BudgetDashboardCard goal={activeGoal} />
          <BudgetSpendQuickAdd />
          <BudgetSourceBreakdown summary={currentWeekSummary} />
          <BudgetWeeklyWrapCard summary={currentWeekSummary} weekStartDate={currentWeekStartDate} />
          <BudgetSwitchGoalDialog />
          <BudgetNudgeCard nudge={payload?.nudge} />
        </>
      )}
    </div>
  )
}
