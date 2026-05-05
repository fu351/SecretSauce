import { assertSafeSocialProjectionPayload } from "@/lib/foundation/privacy"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"

export const RECIPE_FEEDBACK_OUTCOMES = [
  "succeeded",
  "needed_tweaks",
  "skipped_feedback",
] as const

export type RecipeFeedbackOutcome = (typeof RECIPE_FEEDBACK_OUTCOMES)[number]

// Locked chip list (Sprint 2 spec). Do not add custom tags.
export const RECIPE_FEEDBACK_TAGS = [
  "too_salty",
  "not_salty_enough",
  "too_spicy",
  "not_spicy_enough",
  "bland",
  "too_sweet",
  "took_longer",
  "too_hard",
  "easier_than_expected",
  "portion_too_small",
  "portion_too_large",
  "ingredient_swap",
  "unclear_steps",
  "worked_well",
  "budget_friendly",
  "good_for_meal_prep",
  "would_make_again",
] as const

export type RecipeFeedbackTag = (typeof RECIPE_FEEDBACK_TAGS)[number]

const MAX_TAGS_PER_FEEDBACK = 6

// Reliability tier thresholds (Sprint 2 spec).
export const RELIABILITY_TIER_BUILDING_MIN = 3
export const RELIABILITY_TIER_TESTED_MIN = 10

export type RecipeReliabilityTier = "early" | "building" | "tested"

export function validateRecipeTryFeedbackOutcome(value: unknown): value is RecipeFeedbackOutcome {
  return typeof value === "string" && RECIPE_FEEDBACK_OUTCOMES.includes(value as RecipeFeedbackOutcome)
}

export function isRecipeFeedbackTag(value: unknown): value is RecipeFeedbackTag {
  return typeof value === "string" && RECIPE_FEEDBACK_TAGS.includes(value as RecipeFeedbackTag)
}

/**
 * Returns the validated, de-duplicated tag list, or null if any tag is not in the locked set.
 * Rejects arbitrary strings, non-arrays, and oversized lists. Returns an empty array for
 * undefined / null / empty input so callers can normalize "no tags" safely.
 */
export function validateRecipeFeedbackTags(
  value: unknown,
  outcome: RecipeFeedbackOutcome,
): { ok: true; tags: RecipeFeedbackTag[] } | { ok: false; error: string } {
  if (outcome === "skipped_feedback") {
    // Skipped feedback must carry no tags.
    if (value === undefined || value === null) return { ok: true, tags: [] }
    if (Array.isArray(value) && value.length === 0) return { ok: true, tags: [] }
    return { ok: false, error: "skipped_feedback cannot include tags" }
  }
  if (value === undefined || value === null) return { ok: true, tags: [] }
  if (!Array.isArray(value)) return { ok: false, error: "feedback_tags must be an array" }
  if (value.length > MAX_TAGS_PER_FEEDBACK) {
    return { ok: false, error: `feedback_tags exceeds max of ${MAX_TAGS_PER_FEEDBACK}` }
  }
  const seen = new Set<RecipeFeedbackTag>()
  for (const entry of value) {
    if (!isRecipeFeedbackTag(entry)) {
      return { ok: false, error: `Unknown feedback tag: ${String(entry)}` }
    }
    seen.add(entry)
  }
  return { ok: true, tags: Array.from(seen) }
}

export type RecipeFeedbackCounts = {
  succeeded: number
  neededTweaks: number
  skipped: number
}

/**
 * Peer Success Score = succeeded / (succeeded + needed_tweaks).
 * Skipped feedback is never counted toward either numerator or denominator,
 * matching spec constraint 8 ("skipped/no_feedback does not count as success"
 * or toward failure).
 */
export function calculatePeerSuccessScore(counts: RecipeFeedbackCounts): {
  submittedCount: number
  successCount: number
  successRate: number | null
} {
  const submitted = counts.succeeded + counts.neededTweaks
  if (submitted <= 0) {
    return { submittedCount: 0, successCount: 0, successRate: null }
  }
  return {
    submittedCount: submitted,
    successCount: counts.succeeded,
    successRate: counts.succeeded / submitted,
  }
}

export function getRecipeReliabilityTier(submittedCount: number): RecipeReliabilityTier {
  if (submittedCount >= RELIABILITY_TIER_TESTED_MIN) return "tested"
  if (submittedCount >= RELIABILITY_TIER_BUILDING_MIN) return "building"
  return "early"
}

export function shouldShowSuccessPercentage(submittedCount: number): boolean {
  return submittedCount >= RELIABILITY_TIER_BUILDING_MIN
}

/**
 * Returns the top tags by frequency with stable ordering. Ties broken by the
 * order that tags appear in RECIPE_FEEDBACK_TAGS (lock-list order), so the
 * output is deterministic regardless of aggregation order.
 */
export function summarizeTopFeedbackTags(
  tagCounts: Record<string, number>,
  limit = 3,
): Array<{ tag: RecipeFeedbackTag; count: number }> {
  const entries: Array<{ tag: RecipeFeedbackTag; count: number }> = []
  for (const tag of RECIPE_FEEDBACK_TAGS) {
    const count = tagCounts[tag] ?? 0
    if (count > 0) entries.push({ tag, count })
  }
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return RECIPE_FEEDBACK_TAGS.indexOf(a.tag) - RECIPE_FEEDBACK_TAGS.indexOf(b.tag)
  })
  return entries.slice(0, Math.max(0, limit))
}

export function buildRecipeFeedbackIdempotencyKey(profileId: string, recipeTryId: string): string {
  return buildIdempotencyKey(["recipe-try-feedback", profileId, recipeTryId])
}

export type SanitizedPeerScore = {
  recipeId: string
  submittedCount: number
  successCount: number
  successRate: number | null
  successPercentage: number | null
  reliabilityTier: RecipeReliabilityTier
  topTags: Array<{ tag: RecipeFeedbackTag; count: number }>
  computedAt: string
}

/**
 * Strips anything that could leak private or AI-confidence metadata before
 * returning peer score data to a client. Also runs the foundation sanitizer
 * to reuse the existing deny-list of unsafe keys.
 */
export function sanitizeRecipePeerScoreForClient(input: {
  recipeId: string
  counts: RecipeFeedbackCounts
  tagCounts: Record<string, number>
  computedAt?: string
}): SanitizedPeerScore {
  const { submittedCount, successCount, successRate } = calculatePeerSuccessScore(input.counts)
  const showPercentage = shouldShowSuccessPercentage(submittedCount)
  const tier = getRecipeReliabilityTier(submittedCount)
  const topTags = summarizeTopFeedbackTags(input.tagCounts)
  const payload: SanitizedPeerScore = {
    recipeId: input.recipeId,
    submittedCount,
    successCount,
    successRate: showPercentage ? successRate : null,
    successPercentage:
      showPercentage && successRate !== null ? Math.round(successRate * 100) : null,
    reliabilityTier: tier,
    topTags,
    computedAt: input.computedAt ?? new Date().toISOString(),
  }
  assertSafeSocialProjectionPayload(payload as unknown as Record<string, unknown>)
  return payload
}
