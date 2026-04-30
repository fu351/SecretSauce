export const STREAK_DAY_STATUSES = ["counted", "grace", "frozen", "pending", "skipped"] as const
export type StreakDayStatus = (typeof STREAK_DAY_STATUSES)[number]

export const STREAK_MILESTONES = [7, 21, 45, 90] as const
export type StreakMilestone = (typeof STREAK_MILESTONES)[number]

export type VerificationEligibilityInput = {
  onPlanScore?: number | null
  homeCookedScore?: number | null
  nutritionAlignScore?: number | null
  budgetAlignScore?: number | null
  confidence?: number | null
  goalFocus?: "budget" | "health" | "balanced"
}

export interface UserStreakState {
  profileId: string
  currentCount: number
  longestCount: number
  freezeTokens: number
  graceUsedWeekStart: string | null
  lastCountedOn: string | null
}
