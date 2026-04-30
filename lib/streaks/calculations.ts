import { STREAK_MILESTONES, type StreakMilestone, type VerificationEligibilityInput } from "@/lib/streaks/types"

const DAY_MS = 24 * 60 * 60 * 1000

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getLocalStreakDate(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input
  return toIsoDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())))
}

export function getWeekStartForGrace(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input
  const day = date.getUTCDay()
  const diff = (day + 6) % 7
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  weekStart.setUTCDate(weekStart.getUTCDate() - diff)
  return toIsoDay(weekStart)
}

export function canCountMealForDate(existingStatus: string | null | undefined): boolean {
  return existingStatus !== "counted"
}

export function calculateCurrentStreak(lastCountedOn: string | null, currentCount: number, today: string): number {
  if (!lastCountedOn) return 0
  const last = new Date(`${lastCountedOn}T00:00:00.000Z`).getTime()
  const now = new Date(`${today}T00:00:00.000Z`).getTime()
  const deltaDays = Math.round((now - last) / DAY_MS)
  if (deltaDays <= 1) return currentCount
  return 0
}

export function shouldApplyGraceSkip(input: { graceUsedWeekStart: string | null; streakDate: string; expectedPreviousDayCounted: boolean }): boolean {
  if (!input.expectedPreviousDayCounted) return false
  return input.graceUsedWeekStart !== getWeekStartForGrace(input.streakDate)
}

export function canUseFreezeToken(freezeTokens: number): boolean {
  return freezeTokens > 0
}

export function earnFreezeTokensFromConsistency(previousCount: number, nextCount: number): number {
  const previousBuckets = Math.floor(previousCount / 7)
  const nextBuckets = Math.floor(nextCount / 7)
  return Math.max(0, nextBuckets - previousBuckets)
}

export function detectMilestone(count: number): StreakMilestone | null {
  return (STREAK_MILESTONES.find((value) => value === count) as StreakMilestone | undefined) ?? null
}

export function shouldArchiveMilestone(existingMilestones: number[], nextCount: number): boolean {
  const milestone = detectMilestone(nextCount)
  if (!milestone) return false
  return !existingMilestones.includes(milestone)
}

export function calculateWeeklyCookDialCount(dates: string[], now = new Date()): number {
  const weekStart = getWeekStartForGrace(now)
  const weekStartMs = new Date(`${weekStart}T00:00:00.000Z`).getTime()
  const weekEndMs = weekStartMs + 6 * DAY_MS
  return dates.filter((date) => {
    const ts = new Date(`${date}T00:00:00.000Z`).getTime()
    return ts >= weekStartMs && ts <= weekEndMs
  }).length
}

export function classifyVerificationForStreakEligibility(input: VerificationEligibilityInput): { eligible: boolean; reason: string } {
  const goalFocus = input.goalFocus ?? "balanced"
  const onPlan = input.onPlanScore ?? 0
  const home = input.homeCookedScore ?? 0
  const nutrition = input.nutritionAlignScore ?? 0
  const budget = input.budgetAlignScore ?? 0
  const confidence = input.confidence ?? 0

  if (confidence < 0.4) return { eligible: false, reason: "low_confidence_needs_confirmation" }
  if (onPlan >= 0.7) return { eligible: true, reason: "on_plan" }
  if (goalFocus === "budget" && home >= 0.75 && budget >= 0.5) return { eligible: true, reason: "budget_home_cooked" }
  if (goalFocus === "health" && nutrition >= 0.7) return { eligible: true, reason: "nutrition_aligned" }
  if (goalFocus === "balanced" && (onPlan >= 0.55 || home >= 0.6 || nutrition >= 0.6)) {
    return { eligible: true, reason: "balanced_forgiving" }
  }
  return { eligible: false, reason: "requires_user_confirmation" }
}
