import { describe, expect, it } from "vitest"

import type { CanonicalDoubleCheckDailyStatsRow } from "../../../../lib/database/ingredient-match-queue-db"

import { assessConsolidationCandidate } from "../guards"

function buildRow(
  overrides: Partial<CanonicalDoubleCheckDailyStatsRow>
): CanonicalDoubleCheckDailyStatsRow {
  return {
    event_date: "2026-03-23",
    source_canonical: "wontons",
    target_canonical: "wonton",
    decision: "skipped",
    reason: "vector_candidate_discovery",
    direction: "lateral",
    event_count: 3,
    source_category: "frozen",
    target_category: "frozen",
    min_confidence: null,
    max_confidence: null,
    min_similarity: 0.99,
    max_similarity: 0.99,
    ...overrides,
  }
}

describe("assessConsolidationCandidate", () => {
  it("allows trivial plural-singular lateral merges", () => {
    expect(assessConsolidationCandidate(buildRow({}))).toEqual({
      allowed: true,
      reason: "simple_plural_s_match",
    })
  })

  it("allows trailing-s plural pairs like cookie and cookies", () => {
    expect(
      assessConsolidationCandidate(
        buildRow({
          source_canonical: "butter cookie",
          target_canonical: "butter cookies",
        })
      )
    ).toEqual({
      allowed: true,
      reason: "simple_plural_s_match",
    })
  })

  it("blocks specific-to-generic merges for manual review", () => {
    expect(
      assessConsolidationCandidate(
        buildRow({
          source_canonical: "salmon steak",
          target_canonical: "salmon",
          direction: "specific_to_generic",
        })
      )
    ).toEqual({
      allowed: false,
      reason: "direction_specific_to_generic_requires_manual_review",
    })
  })

  it("blocks risky lateral modifier swaps", () => {
    expect(
      assessConsolidationCandidate(
        buildRow({
          source_canonical: "light brown sugar",
          target_canonical: "dark brown sugar",
        })
      )
    ).toEqual({
      allowed: false,
      reason: "non_trivial_lateral_variant_requires_manual_review",
    })
  })

  it("blocks cross-category pairs even when names are similar", () => {
    expect(
      assessConsolidationCandidate(
        buildRow({
          source_canonical: "grapefruit juice",
          target_canonical: "grapefruit drink",
          source_category: "beverage",
          target_category: "snacks",
        })
      )
    ).toEqual({
      allowed: false,
      reason: "cross_category_requires_manual_review",
    })
  })

  it("allows exact normalized matches", () => {
    expect(
      assessConsolidationCandidate(
        buildRow({
          source_canonical: "  Lemon   Zest ",
          target_canonical: "lemon zest",
        })
      )
    ).toEqual({
      allowed: true,
      reason: "exact_normalized_match",
    })
  })

  it("allows high-similarity weighted matches with enough product usage", () => {
    expect(
      assessConsolidationCandidate(buildRow({
        source_canonical: "ground chili pepper",
        target_canonical: "chili pepper ground",
        max_similarity: 0.985,
      }), {
        productCounts: new Map([
          ["ground chili pepper", 9],
          ["chili pepper ground", 9],
        ]),
        weightedSimilarityThreshold: 0.97,
        minWeightedProductCount: 5,
      })
    ).toEqual({
      allowed: true,
      reason: "weighted_product_count_vector_match",
    })
  })

  it("blocks weighted matches when product usage is too low", () => {
    expect(
      assessConsolidationCandidate(buildRow({
        source_canonical: "ground chili pepper",
        target_canonical: "chili pepper ground",
        max_similarity: 0.985,
      }), {
        productCounts: new Map([
          ["ground chili pepper", 1],
          ["chili pepper ground", 2],
        ]),
        weightedSimilarityThreshold: 0.97,
        minWeightedProductCount: 5,
      })
    ).toEqual({
      allowed: false,
      reason: "non_trivial_lateral_variant_requires_manual_review",
    })
  })
})
