import { describe, expect, it } from "vitest"
import { summarizeIngredientStandardization, summarizeUnitStandardization } from "../utils"

describe("standardizer utils summaries", () => {
  it("summarizes ingredient standardization with requested-vs-returned counts", () => {
    const summary = summarizeIngredientStandardization(3, [
      {
        id: "1",
        originalName: "olive oil",
        canonicalName: "olive oil",
        isFoodItem: true,
        confidence: 0.91,
      },
      {
        id: "2",
        originalName: "salt",
        canonicalName: "salt",
        isFoodItem: true,
        confidence: 0.95,
      },
    ])

    expect(summary).toEqual({
      requested: 3,
      succeeded: 2,
      failed: 1,
    })
  })

  it("summarizes unit standardization based on status", () => {
    const summary = summarizeUnitStandardization(2, [
      {
        id: "1",
        resolvedUnit: "oz",
        resolvedQuantity: 12,
        confidence: 0.9,
        status: "success",
      },
      {
        id: "2",
        resolvedUnit: null,
        resolvedQuantity: null,
        confidence: 0,
        status: "error",
        error: "No explicit unit found",
      },
    ])

    expect(summary).toEqual({
      requested: 2,
      succeeded: 1,
      failed: 1,
    })
  })
})
