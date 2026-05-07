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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
  if (payload?.featureState?.budgetTrackingEnabled === false) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Savings is currently hidden</h1>
        <p className="mt-2 text-sm text-muted-foreground">Turn Savings back on in settings any time.</p>
      </div>
    )
  }
  const activeGoal = payload?.activeGoal
  const completedGoal = payload?.completedGoal
  const currentWeekSummary = payload?.currentWeek?.summary
  const currentWeekStartDate = payload?.currentWeek?.weekStartDate

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 pb-8 md:p-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Detailed page</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Savings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Manage your weekly savings goal, log safe owner-only spend, and bank surplus from completed weeks.
        </p>
      </div>
      {!activeGoal ? (
        <>
          {completedGoal ? (
            <Card>
              <CardHeader>
                <CardTitle>Completed goal</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{completedGoal.name}</p>
                <p className="text-sm text-muted-foreground">Nice work. Start a new goal whenever you are ready.</p>
              </CardContent>
            </Card>
          ) : null}
          <BudgetSetupCard />
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="grid gap-4">
              <BudgetDashboardCard goal={activeGoal} />
              <BudgetSourceBreakdown summary={currentWeekSummary} />
              <BudgetWeeklyWrapCard summary={currentWeekSummary} weekStartDate={currentWeekStartDate} />
            </div>
            <div className="grid content-start gap-4">
              <BudgetSpendQuickAdd />
              <BudgetSwitchGoalDialog />
            </div>
          </div>
          <BudgetNudgeCard nudge={payload?.nudge} />
        </>
      )}
    </div>
  )
}
