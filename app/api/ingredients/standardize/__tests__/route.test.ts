import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockStandardizeIngredientsWithAI,
  mockBatchGetOrCreate,
  mockPantryUpdate,
} = vi.hoisted(() => ({
  mockStandardizeIngredientsWithAI: vi.fn(),
  mockBatchGetOrCreate: vi.fn(),
  mockPantryUpdate: vi.fn(),
}))

vi.mock("@/backend/workers/standardizer-worker", () => ({
  standardizeIngredientsWithAI: mockStandardizeIngredientsWithAI,
}))

vi.mock("@/lib/database/standardized-ingredients-db", () => ({
  standardizedIngredientsDB: {
    batchGetOrCreate: mockBatchGetOrCreate,
  },
}))

vi.mock("@/lib/database/pantry-items-db", () => ({
  pantryItemsDB: {
    update: mockPantryUpdate,
  },
}))

import { POST } from "../route"

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/ingredients/standardize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /api/ingredients/standardize", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStandardizeIngredientsWithAI.mockResolvedValue([
      {
        id: "0",
        originalName: "Milk",
        canonicalName: "milk",
        category: "dairy",
        confidence: 0.98,
      },
    ])
    mockBatchGetOrCreate.mockResolvedValue(new Map([["milk", "std_1"]]))
    mockPantryUpdate.mockResolvedValue(undefined)
  })

  it("rejects non-pantry contexts", async () => {
    const response = await POST(
      makeRequest({
        context: "recipe",
        pantryItemId: "pantry_1",
        userId: "user_1",
        ingredients: [{ name: "Milk" }],
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: "RECIPE_CONTEXT_REJECTED",
    })
  })

  it("returns 400 when ingredients are missing", async () => {
    const response = await POST(
      makeRequest({
        context: "pantry",
        pantryItemId: "pantry_1",
        userId: "user_1",
        ingredients: [],
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "No ingredients supplied" })
  })

  it("returns 400 when pantry identity fields are missing", async () => {
    const response = await POST(
      makeRequest({
        context: "pantry",
        ingredients: [{ name: "Milk" }],
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "pantryItemId and userId are required",
    })
  })

  it("returns 400 when every ingredient name is blank", async () => {
    const response = await POST(
      makeRequest({
        context: "pantry",
        pantryItemId: "pantry_1",
        userId: "user_1",
        ingredients: [{ name: "   " }],
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "All ingredients were blank" })
  })

  it("normalizes ingredient inputs, standardizes them, and updates the pantry item", async () => {
    const response = await POST(
      makeRequest({
        context: "pantry",
        pantryItemId: "pantry_1",
        userId: "user_1",
        ingredients: [
          { name: "  Milk  ", quantity: 2, unit: " cups " },
          { id: "keep", name: "Eggs", amount: "12", unit: "each" },
        ],
      }) as any
    )

    expect(mockStandardizeIngredientsWithAI).toHaveBeenCalledWith(
      [
        { id: "0", name: "Milk", amount: "2", unit: "cups", originalIndex: 0 },
        { id: "keep", name: "Eggs", amount: "12", unit: "each", originalIndex: 1 },
      ],
      "pantry"
    )
    expect(mockBatchGetOrCreate).toHaveBeenCalledWith([
      { canonicalName: "milk", category: "dairy" },
    ])
    expect(mockPantryUpdate).toHaveBeenCalledWith("pantry_1", {
      standardized_ingredient_id: "std_1",
      standardized_name: "milk",
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      context: "pantry",
      standardized: [
        {
          id: "0",
          originalName: "Milk",
          canonicalName: "milk",
          category: "dairy",
          standardizedIngredientId: "std_1",
          confidence: 0.98,
          originalIndex: 0,
        },
      ],
    })
  })

  it("returns 500 when standardization throws", async () => {
    mockStandardizeIngredientsWithAI.mockRejectedValue(new Error("AI unavailable"))

    const response = await POST(
      makeRequest({
        context: "pantry",
        pantryItemId: "pantry_1",
        userId: "user_1",
        ingredients: [{ name: "Milk" }],
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Failed to standardize ingredients",
    })
  })
})
