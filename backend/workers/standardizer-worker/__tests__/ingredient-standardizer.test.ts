import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const axiosMock = vi.hoisted(() => ({
  post: vi.fn(),
}))

const databaseMock = vi.hoisted(() => ({
  getCanonicalNameSample: vi.fn(),
}))

vi.mock("axios", () => ({
  default: {
    post: axiosMock.post,
  },
}))

vi.mock("../../../../lib/database/standardized-ingredients-db", () => ({
  standardizedIngredientsDB: {
    getCanonicalNameSample: databaseMock.getCanonicalNameSample,
  },
}))

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

describe("ingredient standardizer non-food override", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = "test-key"
    databaseMock.getCanonicalNameSample.mockResolvedValue(["butter"])
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  id: "item-1",
                  originalName: "Lip Butter Balm Duo",
                  canonicalName: "butter",
                  isFoodItem: true,
                  category: "dairy",
                  confidence: 0.91,
                },
              ]),
            },
          },
        ],
      },
    })
  })

  afterEach(() => {
    vi.resetModules()
    delete process.env.OPENAI_API_KEY
  })

  it("forces obvious non-food titles to non-food even when the model misclassifies them", async () => {
    const { standardizeIngredientsWithAI } = await import("../ingredient-standardizer")

    const results = await standardizeIngredientsWithAI(
      [
        {
          id: "item-1",
          name: "Lip Butter Balm Duo",
        },
      ],
      "scraper"
    )

    expect(results).toEqual([
      {
        id: "item-1",
        originalName: "Lip Butter Balm Duo",
        canonicalName: "lip butter balm duo",
        isFoodItem: false,
        category: null,
        confidence: 0.12,
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

describe("realtime deterministic standardizer", () => {
  it('keeps "tomato seeds" distinct from "tomato"', async () => {
    const { standardizeIngredientsDeterministically } = await import("../realtime-standardizer")

    const results = standardizeIngredientsDeterministically(
      [
        {
          id: "item-1",
          name: "Tomato Seeds",
        },
      ],
      "pantry"
    )

    expect(results).toEqual([
      {
        id: "item-1",
        originalName: "Tomato Seeds",
        canonicalName: "tomato seeds",
        isFoodItem: true,
        category: "produce",
        confidence: 0.92,
      },
    ])
  })
})
