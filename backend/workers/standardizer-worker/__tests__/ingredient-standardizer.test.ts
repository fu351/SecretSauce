import { afterEach, describe, expect, it, vi } from "vitest"

describe("ingredient standardizer fallback", () => {
  afterEach(() => {
    vi.resetModules()
    delete process.env.OPENAI_API_KEY
  })

  it("marks fallback ingredient results as non-food when OpenAI is unavailable", async () => {
    delete process.env.OPENAI_API_KEY

    const { standardizeIngredientsWithAI } = await import("../ingredient-standardizer")

    const results = await standardizeIngredientsWithAI(
      [
        {
          id: "item-1",
          name: "dish soap",
        },
      ],
      "pantry"
    )

    expect(results).toEqual([
      {
        id: "item-1",
        originalName: "dish soap",
        canonicalName: "dish soap",
        isFoodItem: false,
        category: null,
        confidence: 0,
      },
    ])
  })
})

describe("ingredient standardizer contexts", () => {
  it("recognizes scraper as an explicit context", async () => {
    const { resolveIngredientStandardizerContext } = await import("../ingredient-standardizer")

    expect(resolveIngredientStandardizerContext("scraper")).toBe("scraper")
  })

  it("uses lenient prepared-food guidance for recipe context and stricter retail-title guidance for scraper context", async () => {
    const { getIngredientStandardizerContextRules } = await import("../ingredient-standardizer")

    const recipeRules = getIngredientStandardizerContextRules("recipe")
    const scraperRules = getIngredientStandardizerContextRules("scraper")

    expect(recipeRules.contextGuidance).toContain("can legitimately include prepared, branded, or packaged products")
    expect(recipeRules.convenienceFoodsRules).toContain("Prepared ingredient products are ACCEPTABLE")
    expect(scraperRules.contextGuidance).toContain("often come from noisy retail product titles")
    expect(scraperRules.lowConfidenceBandLabel).toBe("Convenience food from scraper row")
  })
})
