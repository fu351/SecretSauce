import { beforeEach, describe, expect, it, vi } from "vitest"

const ingredientDeps = vi.hoisted(() => ({
  resolveIngredientStandardizerContext: vi.fn(),
  standardizeIngredientsWithAI: vi.fn(),
}))

const unitDeps = vi.hoisted(() => ({
  standardizeUnitsWithAI: vi.fn(),
}))

vi.mock("../ingredient-standardizer", () => ({
  resolveIngredientStandardizerContext: ingredientDeps.resolveIngredientStandardizerContext,
  standardizeIngredientsWithAI: ingredientDeps.standardizeIngredientsWithAI,
}))

vi.mock("../unit-standardizer", () => ({
  standardizeUnitsWithAI: unitDeps.standardizeUnitsWithAI,
}))

import { runStandardizerProcessor } from "../processor"

describe("runStandardizerProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ingredientDeps.resolveIngredientStandardizerContext.mockReturnValue("pantry")
  })

  it("handles ingredient jobs with resolved context and summary", async () => {
    const inputs = [{ id: "1", name: "olive oil" }]
    ingredientDeps.standardizeIngredientsWithAI.mockResolvedValue([
      {
        id: "1",
        originalName: "olive oil",
        canonicalName: "olive oil",
        isFoodItem: true,
        confidence: 0.92,
      },
    ])

    const result = await runStandardizerProcessor({
      mode: "ingredient",
      context: "recipe",
      inputs,
    })

    expect(ingredientDeps.resolveIngredientStandardizerContext).toHaveBeenCalledWith("recipe")
    expect(ingredientDeps.standardizeIngredientsWithAI).toHaveBeenCalledWith(inputs, "pantry")
    expect(result).toEqual({
      mode: "ingredient",
      context: "pantry",
      results: [
        {
          id: "1",
          originalName: "olive oil",
          canonicalName: "olive oil",
          isFoodItem: true,
          confidence: 0.92,
        },
      ],
      summary: {
        requested: 1,
        succeeded: 1,
        failed: 0,
      },
    })
  })

  it("handles unit jobs and computes failure counts from statuses", async () => {
    const inputs = [
      { id: "u-1", rawProductName: "Soda 12 oz", source: "scraper" as const },
      { id: "u-2", rawProductName: "Olive oil", source: "scraper" as const },
    ]

    unitDeps.standardizeUnitsWithAI.mockResolvedValue([
      {
        id: "u-1",
        resolvedUnit: "oz",
        resolvedQuantity: 12,
        confidence: 0.93,
        status: "success",
      },
      {
        id: "u-2",
        resolvedUnit: null,
        resolvedQuantity: null,
        confidence: 0,
        status: "error",
        error: "No explicit unit found",
      },
    ])

    const result = await runStandardizerProcessor({
      mode: "unit",
      inputs,
    })

    expect(unitDeps.standardizeUnitsWithAI).toHaveBeenCalledWith(inputs)
    expect(ingredientDeps.standardizeIngredientsWithAI).not.toHaveBeenCalled()
    expect(result).toEqual({
      mode: "unit",
      results: [
        {
          id: "u-1",
          resolvedUnit: "oz",
          resolvedQuantity: 12,
          confidence: 0.93,
          status: "success",
        },
        {
          id: "u-2",
          resolvedUnit: null,
          resolvedQuantity: null,
          confidence: 0,
          status: "error",
          error: "No explicit unit found",
        },
      ],
      summary: {
        requested: 2,
        succeeded: 1,
        failed: 1,
      },
    })
  })
})
