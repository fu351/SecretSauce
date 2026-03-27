import { beforeEach, describe, expect, it, vi } from "vitest"

const runnerDeps = vi.hoisted(() => ({
  runStandardizerProcessor: vi.fn(),
  sleep: vi.fn(),
}))

vi.mock("../processor", () => ({
  runStandardizerProcessor: runnerDeps.runStandardizerProcessor,
}))

vi.mock("../../env-utils", () => ({
  sleep: runnerDeps.sleep,
}))

import { runStandardizerWorkerLoop } from "../runner"

describe("runStandardizerWorkerLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runnerDeps.sleep.mockResolvedValue(undefined)
  })

  it("runs up to maxCycles and sleeps between cycles", async () => {
    const buildJob = vi
      .fn()
      .mockResolvedValueOnce({
        mode: "ingredient",
        context: "pantry",
        inputs: [{ id: "1", name: "olive oil" }],
      })
      .mockResolvedValueOnce(null)

    runnerDeps.runStandardizerProcessor.mockResolvedValue({
      mode: "ingredient",
      context: "pantry",
      results: [],
      summary: { requested: 1, succeeded: 1, failed: 0 },
    })

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await runStandardizerWorkerLoop({
      workerIntervalSeconds: 1,
      maxCycles: 2,
      buildJob,
    })

    expect(buildJob).toHaveBeenNthCalledWith(1, 1)
    expect(buildJob).toHaveBeenNthCalledWith(2, 2)
    expect(runnerDeps.runStandardizerProcessor).toHaveBeenCalledTimes(1)
    expect(runnerDeps.sleep).toHaveBeenCalledTimes(1)
    expect(runnerDeps.sleep).toHaveBeenCalledWith(1000)
    expect(errorSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it("swallows cycle errors and continues without throwing", async () => {
    const buildJob = vi.fn().mockResolvedValue({
      mode: "unit",
      inputs: [{ id: "1", rawProductName: "olive oil", source: "scraper" }],
    })

    runnerDeps.runStandardizerProcessor.mockRejectedValue(new Error("boom"))

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      runStandardizerWorkerLoop({
        workerIntervalSeconds: 1,
        maxCycles: 1,
        buildJob,
      })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith("[StandardizerRunner] Worker cycle failed:", expect.any(Error))
    expect(runnerDeps.sleep).not.toHaveBeenCalled()

    logSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
