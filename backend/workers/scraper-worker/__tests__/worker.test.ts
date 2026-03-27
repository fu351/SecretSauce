import { describe, expect, it } from "vitest"
import {
  SCRAPER_WORKER_STORES,
  countScraperResults,
  hasRuntimeOverrides,
  resolveScraperWorkerMode,
  resolveScraperWorkerStore,
  sanitizeBatchQueries,
} from "../worker"

describe("scraper worker helpers", () => {
  it("exports expected store keys", () => {
    expect(SCRAPER_WORKER_STORES).toContain("kroger")
    expect(SCRAPER_WORKER_STORES).toContain("target")
    expect(SCRAPER_WORKER_STORES).toContain("walmart")
  })

  it("resolves store aliases and rejects unknown stores", () => {
    expect(resolveScraperWorkerStore("ranch99")).toBe("99ranch")
    expect(resolveScraperWorkerStore("whole_foods")).toBe("wholefoods")
    expect(resolveScraperWorkerStore("TARGET")).toBe("target")
    expect(resolveScraperWorkerStore("unknown")).toBeNull()
  })

  it("resolves mode based on queries input", () => {
    expect(resolveScraperWorkerMode({ store: "kroger", query: "milk" })).toBe("single")
    expect(resolveScraperWorkerMode({ store: "kroger", queries: ["milk"] })).toBe("batch")
    expect(resolveScraperWorkerMode({ store: "kroger", queries: [] })).toBe("single")
  })

  it("sanitizes batch queries by trimming and dropping blanks", () => {
    expect(sanitizeBatchQueries([" milk ", "", "  ", "eggs"])).toEqual(["milk", "eggs"])
    expect(sanitizeBatchQueries(undefined)).toEqual([])
  })

  it("counts flat and nested scraper result arrays", () => {
    expect(countScraperResults([{ id: 1 }, { id: 2 }])).toBe(2)
    expect(countScraperResults([[{ id: "a" }], [{ id: "b" }, { id: "c" }]])).toBe(3)
    expect(countScraperResults([])).toBe(0)
  })

  it("detects whether runtime overrides were provided", () => {
    expect(hasRuntimeOverrides(undefined)).toBe(false)
    expect(hasRuntimeOverrides({})).toBe(false)
    expect(hasRuntimeOverrides({ liveActivation: true })).toBe(true)
    expect(hasRuntimeOverrides({ timeoutMultiplier: 2 })).toBe(true)
  })
})
