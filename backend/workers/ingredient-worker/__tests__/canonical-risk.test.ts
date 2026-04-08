import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CanonicalTokenIdfScorer } from "../canonical/token-idf"

const mocks = vi.hoisted(() => ({
  findByCanonicalName: vi.fn(),
}))

vi.mock("../../../../lib/database/standardized-ingredients-db", () => ({
  standardizedIngredientsDB: {
    findByCanonicalName: mocks.findByCanonicalName,
  },
}))

import { resolveBlockedNewCanonicalFallback } from "../canonical/risk"

function makeScorer(floors: Record<string, number>): CanonicalTokenIdfScorer {
  return {
    loadedAt: Date.now(),
    documentCount: 500,
    getFloor: (canonicalName: string) => floors[canonicalName] ?? 0,
  }
}

describe("resolveBlockedNewCanonicalFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByCanonicalName.mockResolvedValue(null)
  })

  it("recovers retail titles to an existing stripped canonical", async () => {
    mocks.findByCanonicalName.mockImplementation(async (canonicalName: string) => {
      if (canonicalName === "lemonade") {
        return {
          id: "std-1",
          canonical_name: "lemonade",
          category: "beverages",
          is_food_item: true,
        }
      }
      return null
    })

    const result = await resolveBlockedNewCanonicalFallback({
      canonicalName: "minute maid lemonade 2 liter",
      category: "other",
      confidence: 0.124,
      tokenIdfScorer: makeScorer({
        "minute maid lemonade": 0.54,
        "maid lemonade": 0.41,
        lemonade: 0,
      }),
    })

    expect(result).toEqual({
      canonicalName: "lemonade",
      category: "beverages",
      source: "strip_retail_suffix_tail_1_token",
    })
  })

  it("derives a safe stripped canonical when no exact fallback exists yet", async () => {
    const result = await resolveBlockedNewCanonicalFallback({
      canonicalName: "minute maid lemonade 2 liter",
      category: "other",
      confidence: 0.124,
      tokenIdfScorer: makeScorer({
        "minute maid lemonade": 0.54,
        "maid lemonade": 0.41,
        lemonade: 0,
      }),
    })

    expect(result).toEqual({
      canonicalName: "lemonade",
      category: "other",
      source: "derived_strip_retail_suffix_tail_1_token",
    })
  })

  it("does not derive new canonicals from non-retail blocked tails", async () => {
    const result = await resolveBlockedNewCanonicalFallback({
      canonicalName: "orange juice no pulp",
      category: "other",
      confidence: 0.124,
      tokenIdfScorer: makeScorer({
        "juice no pulp": 0.5,
        "no pulp": 0,
      }),
    })

    expect(result).toBeNull()
  })
})
