import { describe, expect, it } from "vitest"

import type { CanonicalDoubleCheckDailyStatsRow } from "../../../../lib/database/ingredient-match-queue-db"

import { buildClusterConsolidationProposals } from "../cluster"

function buildRow(
  source: string,
  target: string,
  similarity = 0.94
): CanonicalDoubleCheckDailyStatsRow {
  return {
    event_date: "2026-03-27",
    source_canonical: source,
    target_canonical: target,
    decision: "skipped",
    reason: "vector_candidate_discovery",
    direction: "lateral",
    event_count: 2,
    source_category: "baking",
    target_category: "baking",
    min_confidence: null,
    max_confidence: null,
    min_similarity: similarity,
    max_similarity: similarity,
  }
}

describe("buildClusterConsolidationProposals", () => {
  it("emits token-core proposals for a coherent sugar cluster", () => {
    const rows = [
      buildRow("brown sugar", "sugar"),
      buildRow("brown sugar", "vanilla sugar"),
      buildRow("vanilla sugar", "sugar"),
    ]
    const productCounts = new Map<string, number>([
      ["sugar", 20],
      ["brown sugar", 8],
      ["vanilla sugar", 3],
    ])

    expect(buildClusterConsolidationProposals(rows, productCounts)).toEqual([
      expect.objectContaining({
        fromCanonical: "brown sugar",
        toCanonical: "sugar",
        commonTokens: ["sugar"],
        clusterSize: 3,
      }),
      expect.objectContaining({
        fromCanonical: "vanilla sugar",
        toCanonical: "sugar",
        commonTokens: ["sugar"],
        clusterSize: 3,
      }),
    ])
  })

  it("does not emit when a mixed cluster lacks a stable common token core", () => {
    const rows = [
      buildRow("chicken sausage", "turkey sausage", 0.93),
      buildRow("turkey sausage", "protein patties", 0.93),
      buildRow("chicken sausage", "protein patties", 0.93),
    ]
    const productCounts = new Map<string, number>([
      ["chicken sausage", 4],
      ["turkey sausage", 5],
      ["protein patties", 6],
    ])

    expect(buildClusterConsolidationProposals(rows, productCounts)).toEqual([])
  })
})
