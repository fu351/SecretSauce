import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByStandardizedId: vi.fn(),
  batchInsertPricesRpc: vi.fn(),
  fetchByIds: vi.fn(),
  runScraperWorkerProcessor: vi.fn(),
}))

vi.mock("../../../lib/database/ingredients-db", () => ({
  ingredientsHistoryDB: {
    batchInsertPricesRpc: mocks.batchInsertPricesRpc,
  },
  ingredientsRecentDB: {
    findByStandardizedId: mocks.findByStandardizedId,
  },
  normalizeStoreName: (value: string) => String(value ?? "").trim().toLowerCase(),
}))

vi.mock("../../../lib/database/standardized-ingredients-db", () => ({
  standardizedIngredientsDB: {
    fetchByIds: mocks.fetchByIds,
  },
}))

vi.mock("../../../lib/utils/zip", () => ({
  normalizeZipCode: (value: string | null | undefined) => {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed || null
  },
}))

vi.mock("./processor", () => ({
  runScraperWorkerProcessor: mocks.runScraperWorkerProcessor,
}))

import { getOrRefreshIngredientPricesForStores } from "./ingredient-pipeline"

describe("getOrRefreshIngredientPricesForStores", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws when standardizedIngredientId is missing", async () => {
    await expect(
      getOrRefreshIngredientPricesForStores("", ["kroger"])
    ).rejects.toThrow("standardizedIngredientId is required")
  })

  it("returns cached data only when no scraping is needed", async () => {
    const cached = [{ id: "c1", store: "kroger", price: 2.99 }]
    mocks.findByStandardizedId.mockResolvedValueOnce(cached)

    const result = await getOrRefreshIngredientPricesForStores(
      "std-1",
      ["kroger"],
      { zipCode: " 94103 " }
    )

    expect(mocks.findByStandardizedId).toHaveBeenCalledWith("std-1", ["kroger"], "94103")
    expect(mocks.fetchByIds).not.toHaveBeenCalled()
    expect(mocks.runScraperWorkerProcessor).not.toHaveBeenCalled()
    expect(mocks.batchInsertPricesRpc).not.toHaveBeenCalled()
    expect(result).toEqual(cached)
  })

  it("does not scrape when allowRealTimeScraping is false", async () => {
    const cached = [{ id: "c1", store: "kroger", price: 2.99 }]
    mocks.findByStandardizedId.mockResolvedValueOnce(cached)

    const result = await getOrRefreshIngredientPricesForStores(
      "std-2",
      ["kroger", "target"],
      { allowRealTimeScraping: false }
    )

    expect(result).toEqual(cached)
    expect(mocks.fetchByIds).not.toHaveBeenCalled()
    expect(mocks.runScraperWorkerProcessor).not.toHaveBeenCalled()
  })

  it("scrapes missing stores and writes the cheapest matched product", async () => {
    const cached = [{ id: "c1", store: "kroger", price: 2.99 }]
    const refreshed = [
      ...cached,
      { id: "c2", store: "target", price: 3.49, product_id: "p-2", product_name: "Olive Oil" },
    ]

    mocks.findByStandardizedId
      .mockResolvedValueOnce(cached)
      .mockResolvedValueOnce(refreshed)
    mocks.fetchByIds.mockResolvedValueOnce([{ canonical_name: "olive oil" }])
    mocks.runScraperWorkerProcessor.mockResolvedValueOnce({
      store: "target",
      mode: "single",
      query: "olive oil",
      totalItems: 2,
      results: [
        { product_name: "Olive Oil Large", price: 5.49, product_id: "p-1", unit: "oz", rawUnit: "24 oz" },
        { product_name: "Olive Oil", price: 3.49, product_id: "p-2", unit: "oz", rawUnit: "12 oz" },
      ],
    })
    mocks.batchInsertPricesRpc.mockResolvedValueOnce(1)

    const result = await getOrRefreshIngredientPricesForStores(
      "std-3",
      ["kroger", "target"],
      { zipCode: "94103" }
    )

    expect(mocks.runScraperWorkerProcessor).toHaveBeenCalledWith({
      store: "target",
      query: "olive oil",
      zipCode: "94103",
      targetStoreMetadata: null,
      runtime: undefined,
    })
    expect(mocks.batchInsertPricesRpc).toHaveBeenCalledWith([
      expect.objectContaining({
        store: "target",
        price: 3.49,
        productName: "Olive Oil 12 oz",
        productId: "p-2",
        rawUnit: "12 oz",
        unit: "12 oz",
      }),
    ])
    expect(result).toEqual(refreshed)
  })

  it("returns existing results when canonical ingredient name is unavailable", async () => {
    const cached = [{ id: "c1", store: "kroger", price: 2.99 }]
    mocks.findByStandardizedId.mockResolvedValueOnce(cached)
    mocks.fetchByIds.mockResolvedValueOnce([{}])

    const result = await getOrRefreshIngredientPricesForStores(
      "std-4",
      ["kroger", "target"]
    )

    expect(mocks.runScraperWorkerProcessor).not.toHaveBeenCalled()
    expect(mocks.batchInsertPricesRpc).not.toHaveBeenCalled()
    expect(result).toEqual(cached)
  })
})
