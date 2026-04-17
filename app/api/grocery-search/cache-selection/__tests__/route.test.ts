import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockResolveStandardizedIngredientId, mockBatchStandardizeAndMatch, mockInsertPrice } =
  vi.hoisted(() => ({
    mockResolveStandardizedIngredientId: vi.fn(),
    mockBatchStandardizeAndMatch: vi.fn(),
    mockInsertPrice: vi.fn(),
  }))

vi.mock("@/lib/database/ingredients-db", () => ({
  ingredientsHistoryDB: {
    resolveStandardizedIngredientId: mockResolveStandardizedIngredientId,
    batchStandardizeAndMatch: mockBatchStandardizeAndMatch,
    insertPrice: mockInsertPrice,
  },
}))

import { POST } from "../route"

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/grocery-search/cache-selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /api/grocery-search/cache-selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveStandardizedIngredientId.mockResolvedValue("std_1")
    mockBatchStandardizeAndMatch.mockResolvedValue(1)
    mockInsertPrice.mockResolvedValue(true)
  })

  it("returns 400 when required fields are missing", async () => {
    const response = await POST(makeRequest({ store: "walmart" }) as any)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "store, product, and either searchTerm or standardizedIngredientId are required",
    })
  })

  it("returns 400 when the selected product is invalid", async () => {
    const response = await POST(
      makeRequest({
        searchTerm: "milk",
        store: "walmart",
        product: { id: "prod_1", title: "", price: 0 },
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "product.id, product.title, and positive product.price are required",
    })
  })

  it("resolves a standardized ingredient id from the search term when one is not provided", async () => {
    const response = await POST(
      makeRequest({
        searchTerm: "whole milk",
        store: "Walmart",
        zipCode: "94110",
        groceryStoreId: "store_1",
        product: {
          id: "prod_1",
          title: "Organic Whole Milk",
          price: 4.99,
          unit: "gallon",
          rawUnit: "gallon",
        },
      }) as any
    )

    expect(mockResolveStandardizedIngredientId).toHaveBeenCalledWith("whole milk")
    expect(mockBatchStandardizeAndMatch).toHaveBeenCalledWith([
      expect.objectContaining({
        standardizedIngredientId: "std_1",
        store: "walmart",
        price: 4.99,
        productName: "Organic Whole Milk",
        productId: "prod_1",
        unit: "gallon",
        rawUnit: "gallon",
        zipCode: "94110",
        groceryStoreId: "store_1",
      }),
    ])
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      inserted: 1,
      cachedViaFallback: false,
      standardizedIngredientId: "std_1",
    })
  })

  it("falls back to direct cache insertion when the RPC insert path returns zero rows", async () => {
    mockBatchStandardizeAndMatch.mockResolvedValue(0)

    const response = await POST(
      makeRequest({
        standardizedIngredientId: "std_42",
        store: "Target",
        product: {
          id: "prod_42",
          title: "Sea Salt",
          price: 2.5,
          image_url: "https://cdn.example.com/salt.png",
          location: "Aisle 4",
        },
      }) as any
    )

    expect(mockInsertPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        standardizedIngredientId: "std_42",
        store: "target",
        productName: "Sea Salt",
        productId: "prod_42",
        price: 2.5,
        imageUrl: "https://cdn.example.com/salt.png",
        location: "Aisle 4",
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      inserted: 0,
      cachedViaFallback: true,
    })
  })

  it("returns 500 when a standardized ingredient id cannot be resolved", async () => {
    mockResolveStandardizedIngredientId.mockResolvedValue(null)

    const response = await POST(
      makeRequest({
        searchTerm: "mystery ingredient",
        store: "walmart",
        product: { id: "prod_9", title: "Mystery", price: 5 },
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Could not resolve standardized ingredient",
    })
  })

  it("returns 500 when the fallback insert fails", async () => {
    mockBatchStandardizeAndMatch.mockResolvedValue(0)
    mockInsertPrice.mockResolvedValue(false)

    const response = await POST(
      makeRequest({
        standardizedIngredientId: "std_1",
        store: "aldi",
        product: { id: "prod_1", title: "Spinach", price: 2.99 },
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Failed to cache selection",
    })
  })
})
