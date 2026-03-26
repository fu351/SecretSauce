import { describe, expect, it, vi } from "vitest"
import { runScraperWorkerProcessor } from "../processor"

describe("runScraperWorkerProcessor", () => {
  it("runs single-mode store queries", async () => {
    const loadModule = vi.fn().mockReturnValue({
      searchWalmartAPI: vi.fn(),
      searchTarget: vi.fn(),
      searchKroger: vi.fn().mockResolvedValue([{ id: "k1" }]),
      searchMeijer: vi.fn(),
      search99Ranch: vi.fn(),
      searchTraderJoes: vi.fn(),
      searchAldi: vi.fn(),
      searchAndronicos: vi.fn(),
      searchWholeFoods: vi.fn(),
      searchSafeway: vi.fn(),
    })

    const result = await runScraperWorkerProcessor(
      {
        store: "kroger",
        query: "milk",
        zipCode: "94103",
      },
      { loadModule }
    )

    const module = loadModule.mock.results[0]?.value
    expect(module.searchKroger).toHaveBeenCalledWith("94103", "milk")
    expect(result).toMatchObject({
      store: "kroger",
      mode: "single",
      query: "milk",
      totalItems: 1,
    })
  })

  it("runs batch-mode with store batch function when available", async () => {
    const searchKrogerBatch = vi.fn().mockResolvedValue([[{ id: "a" }], [{ id: "b" }, { id: "c" }]])
    const loadModule = vi.fn().mockReturnValue({
      searchWalmartAPI: vi.fn(),
      searchTarget: vi.fn(),
      searchKroger: vi.fn(),
      searchMeijer: vi.fn(),
      search99Ranch: vi.fn(),
      searchTraderJoes: vi.fn(),
      searchAldi: vi.fn(),
      searchAndronicos: vi.fn(),
      searchWholeFoods: vi.fn(),
      searchSafeway: vi.fn(),
      searchKrogerBatch,
    })

    const result = await runScraperWorkerProcessor(
      {
        store: "kroger",
        queries: ["milk", "eggs"],
        zipCode: "94103",
        batchConcurrency: 2,
      },
      { loadModule }
    )

    expect(searchKrogerBatch).toHaveBeenCalledWith(["milk", "eggs"], "94103", { concurrency: 2 })
    expect(result).toMatchObject({
      store: "kroger",
      mode: "batch",
      queryCount: 2,
      totalItems: 3,
    })
  })

  it("applies runtime overrides when wrapper is available", async () => {
    const runWithUniversalScraperControls = vi.fn().mockImplementation(async (_overrides, fn) => fn())
    const searchTarget = vi.fn().mockResolvedValue([{ id: "t1" }])

    const loadModule = vi.fn().mockReturnValue({
      searchWalmartAPI: vi.fn(),
      searchTarget,
      searchKroger: vi.fn(),
      searchMeijer: vi.fn(),
      search99Ranch: vi.fn(),
      searchTraderJoes: vi.fn(),
      searchAldi: vi.fn(),
      searchAndronicos: vi.fn(),
      searchWholeFoods: vi.fn(),
      searchSafeway: vi.fn(),
      runWithUniversalScraperControls,
    })

    const result = await runScraperWorkerProcessor(
      {
        store: "target",
        query: "olive oil",
        zipCode: "94103",
        runtime: {
          liveActivation: true,
          timeoutMultiplier: 2,
        },
      },
      { loadModule }
    )

    expect(runWithUniversalScraperControls).toHaveBeenCalledWith(
      { liveActivation: true, timeoutMultiplier: 2 },
      expect.any(Function)
    )
    expect(searchTarget).toHaveBeenCalledWith("olive oil", null, "94103")
    expect(result.totalItems).toBe(1)
  })

  it("throws for unsupported stores", async () => {
    const loadModule = vi.fn()

    await expect(
      runScraperWorkerProcessor(
        {
          store: "unknown-store",
          query: "milk",
        },
        { loadModule }
      )
    ).rejects.toThrow("Unsupported store")

    expect(loadModule).not.toHaveBeenCalled()
  })
})
