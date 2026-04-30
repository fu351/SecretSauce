export const BUDGET_GOAL_CATEGORIES = ["travel", "concert", "gaming", "dining", "generic"] as const
export type BudgetGoalCategory = (typeof BUDGET_GOAL_CATEGORIES)[number]

export const BUDGET_GOAL_STATUSES = ["active", "paused", "completed", "archived"] as const
export type BudgetGoalStatus = (typeof BUDGET_GOAL_STATUSES)[number]

export const BUDGET_SPEND_SOURCES = ["manual", "receipt"] as const
export type BudgetSpendSource = (typeof BUDGET_SPEND_SOURCES)[number]

export const BUDGET_WEEKLY_SUMMARY_STATUSES = ["open", "ready_to_allocate", "allocated", "no_surplus"] as const
export type BudgetWeeklySummaryStatus = (typeof BUDGET_WEEKLY_SUMMARY_STATUSES)[number]

export type BudgetSettings = {
  profileId: string
  weeklyBudgetCents: number
  cycleStartDow: number
  allocationCapBps: number
  nudgeBaseDays: number
  nudgeRecoveryWindowDays: number
  nudgeSnoozeDays: number
}

export type BudgetGoal = {
  id: string
  profileId: string
  name: string
  category: BudgetGoalCategory
  targetCents: number
  currentBalanceCents: number
  status: BudgetGoalStatus
  startedAt: string
  completedAt: string | null
  switchedFromGoalId: string | null
}

export type BudgetSpendLog = {
  id: string
  profileId: string
  weekStartDate: string
  occurredAt: string
  amountCents: number
  sourceType: BudgetSpendSource
}

export type BudgetWeeklySummary = {
  id: string
  profileId: string
  weekStartDate: string
  weekEndDate: string
  weeklyBudgetCents: number
  manualSpendCents: number
  receiptSpendCents: number
  trackedSpendCents: number
  rawSurplusCents: number
  bankableSurplusCents: number
  capApplied: boolean
  status: BudgetWeeklySummaryStatus
  allocationIdempotencyKey: string | null
  allocatedAt: string | null
}
