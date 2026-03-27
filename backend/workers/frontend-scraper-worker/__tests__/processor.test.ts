import { describe, expect, it, vi } from "vitest"
import {
  fetchFrontendScraperApiResponse,
  runFrontendScraperProcessor,
  runFrontendScraperSearch,
} from "../client-processor"

describe("frontend scraper processor", () => {
  it("groups items by store, applies caps, and sorts by total", () => {
    const result = runFrontendScraperProcessor(
      {
        results: [
          { provider: "Store B", title: "Item B1", price: 7, rawUnit: "16 oz" },
          { provider: "Store A", title: "Item A1", price: 3 },
          { provider: "Store A", title: "Item A2", price: 4 },
        ],
      },
      { maxResultsPerStore: 1 }
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ store: "Store A", total: 3 })
    expect(result[0]?.items).toHaveLength(1)
    expect(result[1]).toMatchObject({ store: "Store B", total: 7 })
  })

  it("returns an empty list when payload has no results", () => {
    expect(runFrontendScraperProcessor({ results: [] })).toEqual([])
    expect(runFrontendScraperProcessor({})).toEqual([])
  })

  it("fetches API payload with signal and returns parsed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ provider: "Store A", title: "Olive Oil", price: 5 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    const payload = await fetchFrontendScraperApiResponse(
      { searchTerm: "olive oil", zipCode: "94103" },
      { fetchImpl, timeoutMs: 1_000 }
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/grocery-search?searchTerm=olive%20oil&zipCode=94103",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(payload.results).toHaveLength(1)
  })

  it("throws on non-ok API responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }))

    await expect(
      fetchFrontendScraperApiResponse(
        { searchTerm: "milk" },
        { fetchImpl, timeoutMs: 1_000 }
      )
    ).rejects.toThrow("HTTP error! status: 500")
  })

  it("combines fetch + processing in runFrontendScraperSearch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { provider: "Store B", title: "B", price: 8 },
            { provider: "Store A", title: "A", price: 2 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    const result = await runFrontendScraperSearch(
      { searchTerm: "apple" },
      { fetchImpl, maxResultsPerStore: 5, timeoutMs: 1_000 }
    )

    expect(result.map((row) => row.store)).toEqual(["Store A", "Store B"])
  })
})
