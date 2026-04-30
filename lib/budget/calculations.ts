import type { BudgetSpendLog } from "@/lib/budget/types"

const DAY_MS = 24 * 60 * 60 * 1000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getWeekRange(input: Date | string, cycleStartDow = 1): { weekStartDate: string; weekEndDate: string } {
  const date = typeof input === "string" ? new Date(input) : new Date(input)
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date input")
  }
  const day = date.getUTCDay()
  const offset = (day - cycleStartDow + 7) % 7
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  weekStart.setUTCDate(weekStart.getUTCDate() - offset)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  return {
    weekStartDate: toDateOnlyIso(weekStart),
    weekEndDate: toDateOnlyIso(weekEnd),
  }
}

export function parseIsoDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function isCanonicalWeekStart(weekStartDate: string, cycleStartDow = 1): boolean {
  const parsed = parseIsoDateOrNull(weekStartDate)
  if (!parsed) return false
  return parsed.getUTCDay() === cycleStartDow
}

export function listPendingWeekRanges(lastComputedWeekStart: string | null, now: Date): Array<{ weekStartDate: string; weekEndDate: string }> {
  const currentWeek = getWeekRange(now)
  if (!lastComputedWeekStart) return [currentWeek]

  const pending: Array<{ weekStartDate: string; weekEndDate: string }> = []
  let cursor = new Date(`${lastComputedWeekStart}T00:00:00.000Z`)
  const current = new Date(`${currentWeek.weekStartDate}T00:00:00.000Z`)
  while (cursor <= current) {
    const range = getWeekRange(cursor)
    pending.push(range)
    cursor = new Date(cursor.getTime() + 7 * DAY_MS)
  }
  return pending
}

export function aggregateTrackedSpend(logs: Array<Pick<BudgetSpendLog, "amountCents" | "sourceType">>) {
  let manualCents = 0
  let receiptCents = 0
  for (const log of logs) {
    if (log.sourceType === "receipt") {
      receiptCents += log.amountCents
    } else {
      manualCents += log.amountCents
    }
  }
  return {
    manualCents,
    receiptCents,
    trackedCents: manualCents + receiptCents,
  }
}

export function computeRawSurplus(weeklyBudgetCents: number, trackedCents: number): number {
  return Math.max(0, weeklyBudgetCents - trackedCents)
}

export function computeBankableSurplus(rawSurplusCents: number, weeklyBudgetCents: number, allocationCapBps = 3000): number {
  const capBps = Math.max(0, Math.min(10_000, Math.round(allocationCapBps)))
  const maxBankable = Math.floor((weeklyBudgetCents * capBps) / 10_000)
  return Math.min(rawSurplusCents, maxBankable)
}

export function isCapApplied(rawSurplusCents: number, bankableSurplusCents: number): boolean {
  return bankableSurplusCents < rawSurplusCents
}

export function computeGoalProgressPercent(currentBalanceCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((currentBalanceCents / targetCents) * 100)))
}

export function isGoalCompleted(currentBalanceCents: number, targetCents: number): boolean {
  return targetCents > 0 && currentBalanceCents >= targetCents
}

export function computeAdaptiveThresholdDays(contributionIntervalsDays: number[]): number {
  if (contributionIntervalsDays.length === 0) return 21
  const avg = contributionIntervalsDays.reduce((sum, value) => sum + value, 0) / contributionIntervalsDays.length
  const scaled = Math.round(avg * 2.5)
  return Math.min(35, Math.max(10, scaled))
}

export function isNudgeEligible(input: {
  lastContributionAt: string | null
  currentThresholdDays: number
  snoozedUntil: string | null
  now: Date
}): boolean {
  if (input.snoozedUntil && new Date(input.snoozedUntil) > input.now) {
    return false
  }
  if (!input.lastContributionAt) return false
  const daysSinceContribution = Math.floor((input.now.getTime() - new Date(input.lastContributionAt).getTime()) / DAY_MS)
  return daysSinceContribution >= input.currentThresholdDays
}

export function formatUsdFromCents(cents: number): string {
  const value = cents / 100
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}
