import { describe, expect, it } from "vitest"
import {
  aggregateTrackedSpend,
  computeAdaptiveThresholdDays,
  computeBankableSurplus,
  computeGoalProgressPercent,
  computeRawSurplus,
  getWeekRange,
  isCanonicalWeekStart,
  isGoalCompleted,
  isNudgeEligible,
  parseIsoDateOrNull,
} from "@/lib/budget/calculations"

describe("budget calculations", () => {
  it("uses Monday to Sunday week cycle", () => {
    const range = getWeekRange("2026-04-29T00:00:00.000Z")
    expect(range.weekStartDate).toBe("2026-04-27")
    expect(range.weekEndDate).toBe("2026-05-03")
  })

  it("aggregates manual and receipt spend parity", () => {
    const totals = aggregateTrackedSpend([
      { sourceType: "manual", amountCents: 1200 },
      { sourceType: "receipt", amountCents: 800 },
      { sourceType: "receipt", amountCents: 200 },
    ])
    expect(totals).toEqual({
      manualCents: 1200,
      receiptCents: 1000,
      trackedCents: 2200,
    })
  })

  it("computes surplus with 30% cap and over-budget floor", () => {
    const raw = computeRawSurplus(10000, 5000)
    const bankable = computeBankableSurplus(raw, 10000, 3000)
    expect(raw).toBe(5000)
    expect(bankable).toBe(3000)

    const overBudgetRaw = computeRawSurplus(10000, 12000)
    const overBudgetBankable = computeBankableSurplus(overBudgetRaw, 10000, 3000)
    expect(overBudgetRaw).toBe(0)
    expect(overBudgetBankable).toBe(0)
  })

  it("validates ISO date and canonical week starts", () => {
    expect(parseIsoDateOrNull("2026-04-27")).toBeTruthy()
    expect(parseIsoDateOrNull("2026-4-27")).toBeNull()
    expect(isCanonicalWeekStart("2026-04-27", 1)).toBe(true)
    expect(isCanonicalWeekStart("2026-04-28", 1)).toBe(false)
  })

  it("caps visual progress at 100 while preserving completion threshold", () => {
    expect(computeGoalProgressPercent(15000, 10000)).toBe(100)
    expect(isGoalCompleted(15000, 10000)).toBe(true)
    expect(isGoalCompleted(9999, 10000)).toBe(false)
  })

  it("uses 21-day default nudge threshold and adaptive clamp", () => {
    expect(computeAdaptiveThresholdDays([])).toBe(21)
    expect(computeAdaptiveThresholdDays([1, 2, 3])).toBe(10)
    expect(computeAdaptiveThresholdDays([20, 20, 20])).toBe(35)
    expect(computeAdaptiveThresholdDays([4, 4, 4])).toBe(10)
  })

  it("respects nudge snooze and eligibility windows", () => {
    const now = new Date("2026-05-30T00:00:00.000Z")
    expect(
      isNudgeEligible({
        lastContributionAt: "2026-05-01T00:00:00.000Z",
        currentThresholdDays: 21,
        snoozedUntil: "2026-06-01T00:00:00.000Z",
        now,
      }),
    ).toBe(false)
    expect(
      isNudgeEligible({
        lastContributionAt: "2026-05-01T00:00:00.000Z",
        currentThresholdDays: 21,
        snoozedUntil: null,
        now,
      }),
    ).toBe(true)
  })
})
