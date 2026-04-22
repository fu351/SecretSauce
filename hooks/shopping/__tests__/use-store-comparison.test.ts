import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { server } from "@/test/mocks/server"

// ── Hoisted mocks (must precede all imports that reference them) ──────────────

const {
  mockGetPricingForUser,
  mockGetPricingGaps,
  mockBatchInsertPricesRpc,
  mockBatchInsertPrices,
  mockSearchGroceryStores,
  mockToast,
} = vi.hoisted(() => ({
  mockGetPricingForUser: vi.fn(),
  mockGetPricingGaps: vi.fn(),
  mockBatchInsertPricesRpc: vi.fn(),
  mockBatchInsertPrices: vi.fn(),
  mockSearchGroceryStores: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock("@/lib/database/ingredients-db", () => ({
  ingredientsRecentDB: {
    getPricingForUser: mockGetPricingForUser,
    getPricingGaps: mockGetPricingGaps,
  },
  ingredientsHistoryDB: {
    batchInsertPricesRpc: mockBatchInsertPricesRpc,
    batchInsertPrices: mockBatchInsertPrices,
  },
  normalizeStoreName: (s: string) =>
    s.toLowerCase().replace(/\s+/g, "").replace(/[']/g, "").trim(),
}))

vi.mock("@/backend/orchestrators/frontend-scraper-pipeline/runner", () => ({
  searchGroceryStores: mockSearchGroceryStores,
}))

vi.mock("@/hooks/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}))

import { useStoreComparison } from "../use-store-comparison"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(id: string, name: string, ingredientId?: string) {
  return {
    id,
    name,
    quantity: 1,
    unit: null,
    ingredient_id: ingredientId ?? null,
    standardizedIngredientId: ingredientId ?? null,
    user_id: "user-1",
    checked: false,
    source_type: "manual" as const,
    recipe_id: null,
    recipe_ingredient_id: null,
  } as any
}

function makeScraperResult(store: string, items: Array<{ id: string; title: string; price: number }>) {
  return {
    store,
    items: items.map(i => ({ ...i, image_url: "", provider: store, rawUnit: undefined })),
  }
}

const storeMetadataHandler = http.get("/api/user-store-metadata", () =>
  HttpResponse.json({ metadata: [] })
)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useStoreComparison › performMassSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPricingForUser.mockResolvedValue([])
    mockGetPricingGaps.mockResolvedValue([])
    mockBatchInsertPricesRpc.mockResolvedValue(1)
    mockSearchGroceryStores.mockResolvedValue([])
    server.use(storeMetadataHandler)
  })

  // ── Guard conditions ────────────────────────────────────────────────────────

  describe("guard conditions", () => {
    it("shows an Empty List toast and returns early when shoppingList is empty", async () => {
      const { result } = renderHook(() => useStoreComparison([], "90210", null))

      await act(async () => {
        await result.current.performMassSearch()
      })

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Empty List" })
      )
      expect(mockGetPricingForUser).not.toHaveBeenCalled()
    })

    it("shows a Zip Code Required toast and returns early when zipCode is blank", async () => {
      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk")], "", null)
      )

      await act(async () => {
        await result.current.performMassSearch()
      })

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Zip Code Required" })
      )
      expect(mockGetPricingForUser).not.toHaveBeenCalled()
    })
  })

  // ── showCachedFirst ─────────────────────────────────────────────────────────

  describe("showCachedFirst", () => {
    it("reads cached pricing and marks hasFetched before gap hydration runs", async () => {
      const cached = [
        { standardized_ingredient_id: "ing-1", item_ids: ["item-1"], total_amount: 1, offers: [] },
      ]
      mockGetPricingForUser.mockResolvedValue(cached)

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("item-1", "milk", "ing-1")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: true, skipPricingGaps: true })
      })

      expect(mockGetPricingForUser).toHaveBeenCalledWith("user-1")
      expect(result.current.hasFetched).toBe(true)
    })

    it("calls getPricingForUser exactly once when showCachedFirst is false (no initial read)", async () => {
      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: true })
      })

      // Only the final read, not a pre-render cache pass
      expect(mockGetPricingForUser).toHaveBeenCalledTimes(1)
    })
  })

  // ── Gap hydration ───────────────────────────────────────────────────────────

  describe("gap hydration (skipPricingGaps: false)", () => {
    it("skips getPricingGaps and batchInsertPricesRpc when skipPricingGaps is true", async () => {
      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk", "ing-1")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: true })
      })

      expect(mockGetPricingGaps).not.toHaveBeenCalled()
      expect(mockBatchInsertPricesRpc).not.toHaveBeenCalled()
    })

    it("calls getPricingGaps but skips scraping when there are no gaps", async () => {
      mockGetPricingGaps.mockResolvedValue([])

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk", "ing-1")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: false })
      })

      expect(mockGetPricingGaps).toHaveBeenCalledWith("user-1")
      expect(mockSearchGroceryStores).not.toHaveBeenCalled()
      expect(mockBatchInsertPricesRpc).not.toHaveBeenCalled()
      // Final pricing read still happens
      expect(mockGetPricingForUser).toHaveBeenCalledTimes(1)
    })

    it("scrapes each unique gap ingredient and inserts results via batchInsertPricesRpc", async () => {
      mockGetPricingGaps.mockResolvedValue([
        {
          store: "target",
          grocery_store_id: "store-uuid-1",
          zip_code: "90210",
          ingredients: [
            { id: "ing-1", name: "milk" },
            { id: "ing-2", name: "eggs" },
          ],
        },
      ])
      mockSearchGroceryStores.mockResolvedValue([
        makeScraperResult("target", [{ id: "p1", title: "Whole Milk", price: 3.99 }]),
      ])

      const { result } = renderHook(() =>
        useStoreComparison(
          [makeItem("1", "milk", "ing-1"), makeItem("2", "eggs", "ing-2")],
          "90210",
          null
        )
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: false })
      })

      expect(mockSearchGroceryStores).toHaveBeenCalledTimes(2)
      expect(mockSearchGroceryStores).toHaveBeenCalledWith("milk", "90210", "target", true, "ing-1")
      expect(mockSearchGroceryStores).toHaveBeenCalledWith("eggs", "90210", "target", true, "ing-2")
      expect(mockBatchInsertPricesRpc).toHaveBeenCalledOnce()
    })

    it("calls getPricingForUser after gap hydration to fetch freshly-written prices", async () => {
      mockGetPricingGaps.mockResolvedValue([
        {
          store: "target",
          grocery_store_id: "store-1",
          zip_code: "90210",
          ingredients: [{ id: "ing-1", name: "milk" }],
        },
      ])
      mockSearchGroceryStores.mockResolvedValue([
        makeScraperResult("target", [{ id: "p1", title: "Milk", price: 3.49 }]),
      ])

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk", "ing-1")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: false })
      })

      // getPricingForUser must run AFTER batchInsertPricesRpc to read the fresh data
      const batchCallOrder = mockBatchInsertPricesRpc.mock.invocationCallOrder[0]
      const pricingCallOrder = mockGetPricingForUser.mock.invocationCallOrder[0]
      expect(batchCallOrder).toBeLessThan(pricingCallOrder)
    })

    it("calls batchInsertPricesRpc exactly once — the dead batchInsertPrices fallback is removed", async () => {
      mockGetPricingGaps.mockResolvedValue([
        {
          store: "target",
          grocery_store_id: "store-1",
          zip_code: "90210",
          ingredients: [{ id: "ing-1", name: "milk" }],
        },
      ])
      mockSearchGroceryStores.mockResolvedValue([
        makeScraperResult("target", [{ id: "p1", title: "Milk", price: 3.49 }]),
      ])
      mockBatchInsertPricesRpc.mockResolvedValue(0) // simulate RPC returning 0

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk", "ing-1")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: false })
      })

      expect(mockBatchInsertPricesRpc).toHaveBeenCalledOnce()
      // batchInsertPrices internally calls batchInsertPricesRpc — calling it as a
      // fallback would just re-issue the same failing RPC. It must not be called.
      expect(mockBatchInsertPrices).not.toHaveBeenCalled()
    })

    it("deduplicates ingredients within a gap before scraping", async () => {
      mockGetPricingGaps.mockResolvedValue([
        {
          store: "kroger",
          grocery_store_id: "store-1",
          zip_code: "90210",
          // Same ingredient id twice — must only scrape once
          ingredients: [
            { id: "ing-1", name: "milk" },
            { id: "ing-1", name: "milk" },
          ],
        },
      ])
      mockSearchGroceryStores.mockResolvedValue([])

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk", "ing-1")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: false, skipPricingGaps: false })
      })

      expect(mockSearchGroceryStores).toHaveBeenCalledTimes(1)
    })
  })

  // ── Generation / isStale guards ─────────────────────────────────────────────

  describe("generation / isStale race-condition guards", () => {
    it("bails out after getPricingGaps when a concurrent search has superseded it", async () => {
      let resolveFirstGaps!: (v: any[]) => void
      const firstGapsDeferred = new Promise<any[]>(r => { resolveFirstGaps = r })

      let callCount = 0
      mockGetPricingGaps.mockImplementation(() => {
        callCount++
        return callCount === 1 ? firstGapsDeferred : Promise.resolve([])
      })

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk", "ing-1")], "90210", null)
      )

      // Start search 1 (will pause at the deferred getPricingGaps)
      const search1 = result.current.performMassSearch({
        showCachedFirst: false,
        skipPricingGaps: false,
      })

      // Start search 2 immediately — increments the generation counter, making search 1 stale
      await act(async () => {
        await result.current.performMassSearch({
          showCachedFirst: false,
          skipPricingGaps: false,
        })
      })

      // Release search 1's getPricingGaps with a gap that would normally trigger scraping
      act(() => {
        resolveFirstGaps([
          {
            store: "target",
            grocery_store_id: "g1",
            zip_code: "90210",
            ingredients: [{ id: "ing-1", name: "milk" }],
          },
        ])
      })
      await act(async () => { await search1 })

      // Search 1 detected isStale() after getPricingGaps and bailed early —
      // the scraper and batch insert must not have been called.
      expect(mockSearchGroceryStores).not.toHaveBeenCalled()
      expect(mockBatchInsertPricesRpc).not.toHaveBeenCalled()
    })

    it("does not render results from a superseded search after getPricingForUser", async () => {
      const staleOffers = [{ store: "stale-store", total_price: 1.00, product_name: "Stale Milk" }]
      const freshOffers = [{ store: "fresh-store", total_price: 2.00, product_name: "Fresh Milk" }]

      let resolveFirstPricing!: (v: any[]) => void
      const firstPricingDeferred = new Promise<any[]>(r => { resolveFirstPricing = r })

      let callCount = 0
      mockGetPricingForUser.mockImplementation(() => {
        callCount++
        if (callCount === 1) return firstPricingDeferred
        return Promise.resolve([
          {
            standardized_ingredient_id: "ing-fresh",
            item_ids: ["item-1"],
            total_amount: 1,
            offers: freshOffers,
          },
        ])
      })

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("item-1", "milk", "ing-fresh")], "90210", null)
      )

      // Start search 1 (pauses at getPricingForUser)
      const search1 = result.current.performMassSearch({ showCachedFirst: true, skipPricingGaps: true })

      // Start search 2 (becomes the authoritative generation)
      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: true, skipPricingGaps: true })
      })

      // Release search 1 with stale data — the isStale() guard must discard it
      resolveFirstPricing([
        {
          standardized_ingredient_id: "ing-stale",
          item_ids: ["item-1"],
          total_amount: 1,
          offers: staleOffers,
        },
      ])
      await act(async () => { await search1 })

      // Results must reflect search 2 (fresh) not search 1 (stale)
      const storeNames = result.current.results.map(r => r.store)
      expect(storeNames).not.toContain("stale-store")
    })
  })

  // ── Loading / hasFetched lifecycle ──────────────────────────────────────────

  describe("loading and hasFetched lifecycle", () => {
    it("is not loading before any search is triggered", () => {
      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk")], "90210", null)
      )
      expect(result.current.loading).toBe(false)
      expect(result.current.hasFetched).toBe(false)
    })

    it("sets loading=false and hasFetched=true after a successful search", async () => {
      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: true, skipPricingGaps: true })
      })

      expect(result.current.loading).toBe(false)
      expect(result.current.hasFetched).toBe(true)
    })

    it("sets loading=false and hasFetched=true even when getPricingForUser throws", async () => {
      mockGetPricingForUser.mockRejectedValue(new Error("DB error"))

      const { result } = renderHook(() =>
        useStoreComparison([makeItem("1", "milk")], "90210", null)
      )

      await act(async () => {
        await result.current.performMassSearch({ showCachedFirst: true, skipPricingGaps: true })
      })

      expect(result.current.loading).toBe(false)
      expect(result.current.hasFetched).toBe(true)
    })
  })
})
