import { beforeEach, describe, expect, it, vi } from "vitest"

const runnerDeps = vi.hoisted(() => ({
  runFrontendScraperSearch: vi.fn(),
}))

vi.mock("../client-processor", () => ({
  runFrontendScraperSearch: runnerDeps.runFrontendScraperSearch,
}))

import { runFrontendScraperRunner, searchGroceryStores } from "../runner"

describe("frontend scraper runner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes input through to processor search", async () => {
    runnerDeps.runFrontendScraperSearch.mockResolvedValue([{ store: "Store A", items: [], total: 10 }])

    const result = await runFrontendScraperRunner({
      searchTerm: "milk",
      zipCode: "94103",
      store: "Store A",
      forceRefresh: true,
      standardizedIngredientId: "std-1",
      timeoutMs: 1234,
      maxResultsPerStore: 9,
    })

    expect(runnerDeps.runFrontendScraperSearch).toHaveBeenCalledWith(
      {
        searchTerm: "milk",
        zipCode: "94103",
        store: "Store A",
        forceRefresh: true,
        standardizedIngredientId: "std-1",
        timeoutMs: 1234,
        maxResultsPerStore: 9,
      },
      {
        fetchImpl: undefined,
        timeoutMs: 1234,
        maxResultsPerStore: 9,
      }
    )
    expect(result).toEqual([{ store: "Store A", items: [], total: 10 }])
  })

  it("searchGroceryStores returns empty array on errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    runnerDeps.runFrontendScraperSearch.mockRejectedValue(new Error("network down"))

    const result = await searchGroceryStores("eggs", "94103", "Store B", true, null)

    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith(
      "[FrontendScraperRunner] Error fetching grocery stores:",
      expect.any(Error)
    )

    errorSpy.mockRestore()
  })
})
