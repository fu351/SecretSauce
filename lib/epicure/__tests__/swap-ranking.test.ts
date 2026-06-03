import { describe, expect, it } from "vitest"
import { rankSwaps } from "../swap-ranking"
import type { SwapSuggestion } from "../types"

const raw: SwapSuggestion[] = [
  { ingredient: "turkey", token: "turkey", score: 1.05, sources: ["core", "chem"] },
  { ingredient: "pork", token: "pork", score: 0.98, sources: ["core", "chem"] },
  { ingredient: "beef", token: "beef", score: 0.57, sources: ["core"] },
  { ingredient: "tofu", token: "tofu", score: 0.3, sources: ["core"] },
]

describe("rankSwaps", () => {
  it("sorts by score descending", () => {
    const result = rankSwaps(raw, "chicken", {})
    expect(result.map((r) => r.token)).toEqual(["turkey", "pork", "beef", "tofu"])
  })

  it("excludes the source ingredient itself", () => {
    const withSelf = [...raw, { ingredient: "chicken", token: "chicken", score: 2.0 }]
    const result = rankSwaps(withSelf, "chicken", {})
    expect(result.find((r) => r.token === "chicken")).toBeUndefined()
  })

  it("filters out excluded tokens (e.g. allergens or pantry items)", () => {
    const result = rankSwaps(raw, "chicken", { excludeTokens: ["pork", "beef"] })
    expect(result.map((r) => r.token)).toEqual(["turkey", "tofu"])
  })

  it("drops entries below minScore", () => {
    const result = rankSwaps(raw, "chicken", { minScore: 0.5 })
    expect(result.map((r) => r.token)).toEqual(["turkey", "pork", "beef"])
  })

  it("caps the result count to limit", () => {
    expect(rankSwaps(raw, "chicken", { limit: 2 })).toHaveLength(2)
  })

  it("dedupes by token keeping the highest score", () => {
    const dupes = [
      { ingredient: "pork", token: "pork", score: 0.5 },
      { ingredient: "pork", token: "pork", score: 0.9 },
    ]
    const result = rankSwaps(dupes, "chicken", {})
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.9)
  })

  it("normalizes the source name before comparing (case/spacing insensitive)", () => {
    const withSelf = [...raw, { ingredient: "Turkey", token: "turkey", score: 5 }]
    const result = rankSwaps(withSelf, "  TURKEY ", {})
    expect(result.find((r) => r.token === "turkey")).toBeUndefined()
  })
})
