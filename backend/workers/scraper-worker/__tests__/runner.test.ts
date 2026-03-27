import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../processor", () => ({
  runScraperWorkerProcessor: vi.fn(),
}))

vi.mock("../../env-utils", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

import { runScraperWorkerProcessor } from "../processor"
import { runScraperWorkerLoop } from "../runner"
import { sleep } from "../../env-utils"

describe("runScraperWorkerLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("logs and skips processing when buildJob returns null", async () => {
    const buildJob = vi.fn().mockResolvedValue(null)
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await runScraperWorkerLoop({
      workerIntervalSeconds: 1,
      maxCycles: 1,
      buildJob,
    })

    expect(buildJob).toHaveBeenCalledWith(1)
    expect(runScraperWorkerProcessor).not.toHaveBeenCalled()
    expect(sleep).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith("[ScraperRunner] Cycle 1: no job returned")

    logSpy.mockRestore()
  })

  it("processes each cycle and sleeps between cycles", async () => {
    const buildJob = vi
      .fn()
      .mockResolvedValueOnce({ store: "kroger", query: "milk" })
      .mockResolvedValueOnce({ store: "kroger", query: "eggs" })
    vi.mocked(runScraperWorkerProcessor)
      .mockResolvedValueOnce({
        store: "kroger",
        mode: "single",
        query: "milk",
        totalItems: 1,
        results: [{ id: "a" }],
      })
      .mockResolvedValueOnce({
        store: "kroger",
        mode: "single",
        query: "eggs",
        totalItems: 2,
        results: [{ id: "b" }, { id: "c" }],
      })

    await runScraperWorkerLoop({
      workerIntervalSeconds: 2,
      maxCycles: 2,
      buildJob,
    })

    expect(runScraperWorkerProcessor).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it("continues subsequent cycles after a processor failure", async () => {
    const buildJob = vi
      .fn()
      .mockResolvedValueOnce({ store: "kroger", query: "milk" })
      .mockResolvedValueOnce({ store: "kroger", query: "eggs" })
    vi.mocked(runScraperWorkerProcessor)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        store: "kroger",
        mode: "single",
        query: "eggs",
        totalItems: 1,
        results: [{ id: "ok" }],
      })

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await runScraperWorkerLoop({
      workerIntervalSeconds: 1,
      maxCycles: 2,
      buildJob,
    })

    expect(runScraperWorkerProcessor).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith("[ScraperRunner] Worker cycle failed:", expect.any(Error))
    expect(sleep).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
  })
})
