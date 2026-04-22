import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockResolveStandardizedIngredientId, mockBatchStandardizeAndMatch, mockInsertPrice } =
  vi.hoisted(() => ({
    mockResolveStandardizedIngredientId: vi.fn(),
    mockBatchStandardizeAndMatch: vi.fn(),
    // Kept in mock object so the module import resolves, but must never be called.
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
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  it("returns 400 when store/product/identifier are missing", async () => {
    const response = await POST(makeRequest({ store: "walmart" }) as any)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "store, product, and either searchTerm or standardizedIngredientId are required",
    })
  })

  it("returns 400 when product.title is empty", async () => {
    const response = await POST(
      makeRequest({
        searchTerm: "milk",
        store: "walmart",
        product: { id: "p1", title: "", price: 3.99 },
      }) as any
    )
    expect(response.status).toBe(400)
  })

  it("returns 400 when product.price is zero or missing", async () => {
    const response = await POST(
      makeRequest({
        searchTerm: "milk",
        store: "walmart",
        product: { id: "p1", title: "Milk", price: 0 },
      }) as any
    )
    expect(response.status).toBe(400)
  })

  it("returns 400 when product.id is missing", async () => {
    const response = await POST(
      makeRequest({
        searchTerm: "milk",
        store: "walmart",
        product: { title: "Milk", price: 3.99 },
      }) as any
    )
    expect(response.status).toBe(400)
  })

  // ── Ingredient resolution ────────────────────────────────────────────────────

  it("resolves ingredient id from searchTerm when standardizedIngredientId is absent", async () => {
    const response = await POST(
      makeRequest({
        searchTerm: "whole milk",
        store: "Walmart",
        zipCode: "94110",
        groceryStoreId: "store_1",
        product: { id: "prod_1", title: "Organic Whole Milk", price: 4.99, unit: "gallon", rawUnit: "gallon" },
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
    const body = await response.json()
    expect(body).toMatchObject({ success: true, inserted: 1, standardizedIngredientId: "std_1" })
    // cachedViaFallback was removed — orphaned insertPrice rows are invisible to get_pricing
    expect(body).not.toHaveProperty("cachedViaFallback")
  })

  it("uses provided standardizedIngredientId directly without calling resolveStandardizedIngredientId", async () => {
    const response = await POST(
      makeRequest({
        standardizedIngredientId: "std_direct",
        store: "kroger",
        product: { id: "prod_2", title: "Butter", price: 3.50 },
      }) as any
    )

    expect(mockResolveStandardizedIngredientId).not.toHaveBeenCalled()
    expect(mockBatchStandardizeAndMatch).toHaveBeenCalledWith([
      expect.objectContaining({ standardizedIngredientId: "std_direct" }),
    ])
    expect(response.status).toBe(200)
  })

  it("returns 500 when standardized ingredient id cannot be resolved from searchTerm", async () => {
    mockResolveStandardizedIngredientId.mockResolvedValue(null)

    const response = await POST(
      makeRequest({
        searchTerm: "unknown_xyzzy",
        store: "walmart",
        product: { id: "p9", title: "Mystery", price: 5 },
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Could not resolve standardized ingredient" })
  })

  // ── Persistence failure path ─────────────────────────────────────────────────

  it("returns 500 — and does NOT call insertPrice — when batchStandardizeAndMatch returns 0", async () => {
    // batchStandardizeAndMatch returning 0 means the RPC errored or skipped all items.
    // Previously a direct insertPrice fallback was used, but those rows have no
    // product_mapping_id and are invisible to get_pricing (which joins through
    // product_mappings). The fallback was removed to avoid creating orphaned rows.
    mockBatchStandardizeAndMatch.mockResolvedValue(0)

    const response = await POST(
      makeRequest({
        standardizedIngredientId: "std_42",
        store: "Target",
        product: { id: "prod_42", title: "Sea Salt", price: 2.50 },
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Failed to cache selection" })
    expect(mockInsertPrice).not.toHaveBeenCalled()
  })

  // ── Payload normalisation ────────────────────────────────────────────────────

  it("normalises store name to lowercase in the batchStandardizeAndMatch payload", async () => {
    await POST(
      makeRequest({
        standardizedIngredientId: "std_1",
        store: "Whole Foods",
        product: { id: "p1", title: "Apples", price: 1.99 },
      }) as any
    )

    expect(mockBatchStandardizeAndMatch).toHaveBeenCalledWith([
      expect.objectContaining({ store: "whole foods" }),
    ])
  })

  it("passes null for optional fields when they are absent from the request", async () => {
    await POST(
      makeRequest({
        standardizedIngredientId: "std_1",
        store: "aldi",
        product: { id: "p1", title: "Eggs", price: 2.99 },
      }) as any
    )

    expect(mockBatchStandardizeAndMatch).toHaveBeenCalledWith([
      expect.objectContaining({
        rawUnit: null,
        unit: null,
        zipCode: null,
        groceryStoreId: null,
      }),
    ])
  })

  it("prefers rawUnit over unit when both are provided", async () => {
    await POST(
      makeRequest({
        standardizedIngredientId: "std_1",
        store: "aldi",
        product: { id: "p1", title: "Butter", price: 4.49, rawUnit: "16 oz", unit: "oz" },
      }) as any
    )

    expect(mockBatchStandardizeAndMatch).toHaveBeenCalledWith([
      expect.objectContaining({ rawUnit: "16 oz", unit: "oz" }),
    ])
  })
})
