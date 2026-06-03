import { describe, expect, it } from "vitest"
import { buildAffinity, rankRecipes, scoreRecipe, CUISINE_BONUS } from "../meal-recommendation"
import type { RecipeCandidate } from "../meal-recommendation"

describe("buildAffinity", () => {
  it("gives seed ingredients the seed boost and includes neighbours", () => {
    const affinity = buildAffinity(["chicken"], [
      [
        { ingredient: "pork", token: "pork", score: 0.58 },
        { ingredient: "beef", token: "beef", score: 0.57 },
      ],
    ])
    expect(affinity.get("chicken")).toBe(1)
    expect(affinity.get("pork")).toBe(0.58)
    expect(affinity.get("beef")).toBe(0.57)
  })

  it("keeps the highest score when a token appears in multiple lists", () => {
    const affinity = buildAffinity([], [
      [{ ingredient: "pork", token: "pork", score: 0.4 }],
      [{ ingredient: "pork", token: "pork", score: 0.6 }],
    ])
    expect(affinity.get("pork")).toBe(0.6)
  })

  it("normalizes seed names to tokens", () => {
    const affinity = buildAffinity(["Black Pepper"], [])
    expect(affinity.get("black_pepper")).toBe(1)
  })
})

describe("scoreRecipe", () => {
  const affinity = new Map<string, number>([
    ["pork", 0.58],
    ["beef", 0.57],
  ])

  it("sums matched affinity normalized by recipe size", () => {
    const recipe: RecipeCandidate = { id: "1", title: "Pork & rice", ingredientTokens: ["pork", "rice"] }
    const { score, matchedTokens } = scoreRecipe(recipe, affinity)
    expect(matchedTokens).toEqual(["pork"])
    expect(score).toBeCloseTo(0.29)
  })

  it("returns zero when no ingredients match", () => {
    const recipe: RecipeCandidate = { id: "2", title: "Tofu bowl", ingredientTokens: ["tofu", "rice"] }
    expect(scoreRecipe(recipe, affinity).score).toBe(0)
  })
})

describe("rankRecipes", () => {
  const affinity = new Map<string, number>([
    ["pork", 0.58],
    ["beef", 0.57],
  ])
  const recipes: RecipeCandidate[] = [
    { id: "a", title: "Pork stew", ingredientTokens: ["pork", "onion"], cuisine: "Mediterranean" },
    { id: "b", title: "Beef tacos", ingredientTokens: ["beef", "tortilla"], cuisine: "Latin American" },
    { id: "c", title: "Tofu salad", ingredientTokens: ["tofu", "lettuce"] },
  ]

  it("ranks recipes by match score and drops non-matching recipes", () => {
    const ranked = rankRecipes(recipes, affinity, {})
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"])
    expect(ranked.find((r) => r.id === "c")).toBeUndefined()
  })

  it("applies a cuisine bonus that can reorder results", () => {
    // pork(0.29) vs beef(0.285); a small cuisine bonus on the beef recipe flips order
    const ranked = rankRecipes(recipes, affinity, { cuisine: "Latin American" })
    expect(ranked[0].id).toBe("b")
    expect(ranked[0].matchScore).toBeCloseTo(0.285 + CUISINE_BONUS)
  })

  it("respects the limit", () => {
    expect(rankRecipes(recipes, affinity, { limit: 1 })).toHaveLength(1)
  })
})
