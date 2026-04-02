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
