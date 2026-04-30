import { describe, expect, it } from "vitest"
import {
  calculateWeeklyCookDialCount,
  canCountMealForDate,
  canUseFreezeToken,
  classifyVerificationForStreakEligibility,
  detectMilestone,
  earnFreezeTokensFromConsistency,
  getLocalStreakDate,
  getWeekStartForGrace,
  shouldArchiveMilestone,
} from "@/lib/streaks/calculations"

describe("streak calculations", () => {
  it("normalizes streak date and grace week start", () => {
    expect(getLocalStreakDate("2026-05-01T12:00:00.000Z")).toBe("2026-05-01")
    expect(getWeekStartForGrace("2026-05-01T12:00:00.000Z")).toBe("2026-04-27")
  })

  it("allows only one counted day", () => {
    expect(canCountMealForDate("counted")).toBe(false)
    expect(canCountMealForDate("pending")).toBe(true)
    expect(canCountMealForDate(null)).toBe(true)
  })

  it("earns freeze token every seven counted days", () => {
    expect(earnFreezeTokensFromConsistency(6, 7)).toBe(1)
    expect(earnFreezeTokensFromConsistency(7, 8)).toBe(0)
    expect(canUseFreezeToken(0)).toBe(false)
    expect(canUseFreezeToken(2)).toBe(true)
  })

  it("detects milestones and archive conditions", () => {
    expect(detectMilestone(7)).toBe(7)
    expect(detectMilestone(8)).toBeNull()
    expect(shouldArchiveMilestone([7], 21)).toBe(true)
    expect(shouldArchiveMilestone([7, 21], 21)).toBe(false)
  })

  it("calculates weekly cook dial between 0 and 7", () => {
    const count = calculateWeeklyCookDialCount(
      ["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"],
      new Date("2026-05-03T00:00:00.000Z"),
    )
    expect(count).toBe(7)
  })

  it("classifies eligibility without punitive rejection", () => {
    expect(classifyVerificationForStreakEligibility({ confidence: 0.2 }).eligible).toBe(false)
    expect(classifyVerificationForStreakEligibility({ confidence: 0.9, onPlanScore: 0.8 }).eligible).toBe(true)
    expect(
      classifyVerificationForStreakEligibility({
        confidence: 0.8,
        goalFocus: "health",
        nutritionAlignScore: 0.75,
      }).eligible,
    ).toBe(true)
  })
})
