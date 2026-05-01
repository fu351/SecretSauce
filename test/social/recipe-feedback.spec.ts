import { describe, expect, it } from "vitest"
import {
  RECIPE_FEEDBACK_TAGS,
  calculatePeerSuccessScore,
  getRecipeReliabilityTier,
  sanitizeRecipePeerScoreForClient,
  shouldShowSuccessPercentage,
  summarizeTopFeedbackTags,
  validateRecipeFeedbackTags,
  validateRecipeTryFeedbackOutcome,
} from "@/lib/social/recipe-feedback"

describe("recipe feedback helpers", () => {
  it("validates outcomes against locked enum", () => {
    expect(validateRecipeTryFeedbackOutcome("succeeded")).toBe(true)
    expect(validateRecipeTryFeedbackOutcome("needed_tweaks")).toBe(true)
    expect(validateRecipeTryFeedbackOutcome("skipped_feedback")).toBe(true)
    expect(validateRecipeTryFeedbackOutcome("no_feedback")).toBe(false)
    expect(validateRecipeTryFeedbackOutcome(undefined)).toBe(false)
    expect(validateRecipeTryFeedbackOutcome(42)).toBe(false)
  })

  it("accepts only tags from the locked list and de-duplicates", () => {
    const ok = validateRecipeFeedbackTags(["too_salty", "worked_well", "too_salty"], "needed_tweaks")
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.tags).toEqual(["too_salty", "worked_well"])
    }
  })

  it("rejects arbitrary custom tags", () => {
    const bad = validateRecipeFeedbackTags(["too_salty", "my_custom_tag"], "needed_tweaks")
    expect(bad.ok).toBe(false)
  })

  it("rejects non-array tag input", () => {
    const bad = validateRecipeFeedbackTags("too_salty", "needed_tweaks")
    expect(bad.ok).toBe(false)
  })

  it("requires empty tags when outcome is skipped_feedback", () => {
    expect(validateRecipeFeedbackTags([], "skipped_feedback").ok).toBe(true)
    expect(validateRecipeFeedbackTags(["too_salty"], "skipped_feedback").ok).toBe(false)
  })

  it("computes success rate excluding skipped feedback", () => {
    const result = calculatePeerSuccessScore({ succeeded: 3, neededTweaks: 1, skipped: 7 })
    expect(result.submittedCount).toBe(4)
    expect(result.successCount).toBe(3)
    expect(result.successRate).toBe(0.75)
  })

  it("returns null success rate when nothing has been submitted", () => {
    const result = calculatePeerSuccessScore({ succeeded: 0, neededTweaks: 0, skipped: 99 })
    expect(result.submittedCount).toBe(0)
    expect(result.successRate).toBeNull()
  })

  it("maps submitted count to reliability tiers at the spec thresholds", () => {
    expect(getRecipeReliabilityTier(0)).toBe("early")
    expect(getRecipeReliabilityTier(2)).toBe("early")
    expect(getRecipeReliabilityTier(3)).toBe("building")
    expect(getRecipeReliabilityTier(9)).toBe("building")
    expect(getRecipeReliabilityTier(10)).toBe("tested")
  })

  it("hides percentage below the N>=3 threshold", () => {
    expect(shouldShowSuccessPercentage(0)).toBe(false)
    expect(shouldShowSuccessPercentage(2)).toBe(false)
    expect(shouldShowSuccessPercentage(3)).toBe(true)
    expect(shouldShowSuccessPercentage(20)).toBe(true)
  })

  it("summarizes top tags by frequency with deterministic tie-breaking", () => {
    const top = summarizeTopFeedbackTags({
      too_salty: 5,
      took_longer: 5,
      bland: 2,
      would_make_again: 1,
    })
    expect(top[0].tag).toBe("too_salty")
    expect(top[1].tag).toBe("took_longer")
    expect(top.length).toBe(3)
  })

  it("ignores zero-count tags", () => {
    const top = summarizeTopFeedbackTags({ too_salty: 0, took_longer: 2 })
    expect(top).toEqual([{ tag: "took_longer", count: 2 }])
  })

  it("every locked tag is a stable string identifier", () => {
    for (const tag of RECIPE_FEEDBACK_TAGS) {
      expect(typeof tag).toBe("string")
      expect(tag).toMatch(/^[a-z_]+$/)
    }
  })

  it("sanitized peer score hides percentage under N>=3 and exposes only safe keys", () => {
    const payload = sanitizeRecipePeerScoreForClient({
      recipeId: "recipe-1",
      counts: { succeeded: 1, neededTweaks: 1, skipped: 0 },
      tagCounts: { too_salty: 1 },
    })
    expect(payload.submittedCount).toBe(2)
    expect(payload.successPercentage).toBeNull()
    expect(payload.successRate).toBeNull()
    expect(payload.reliabilityTier).toBe("early")
    expect(Object.keys(payload)).not.toContain("aiConfidence")
    expect(Object.keys(payload)).not.toContain("confidence")
  })

  it("sanitized peer score exposes percentage once N>=3", () => {
    const payload = sanitizeRecipePeerScoreForClient({
      recipeId: "recipe-1",
      counts: { succeeded: 4, neededTweaks: 1, skipped: 10 },
      tagCounts: { took_longer: 3 },
    })
    expect(payload.submittedCount).toBe(5)
    expect(payload.successPercentage).toBe(80)
    expect(payload.reliabilityTier).toBe("building")
    expect(payload.topTags[0].tag).toBe("took_longer")
  })
})
