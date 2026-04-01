import { beforeEach, describe, expect, it, vi } from "vitest"

import { runVectorDoubleCheckPipeline } from "../pipeline"
import type { VectorDoubleCheckWorkerConfig } from "../../../workers/vector-double-check-worker/config"

const {
  mockRunEmbeddingWorker,
  mockRunVectorDoubleCheckDiscovery,
} = vi.hoisted(() => ({
  mockRunEmbeddingWorker: vi.fn(),
  mockRunVectorDoubleCheckDiscovery: vi.fn(),
}))

vi.mock("@/backend/workers/embedding-worker/processor", () => ({
  runEmbeddingWorker: mockRunEmbeddingWorker,
}))

vi.mock("@/backend/workers/vector-double-check-worker/processor", () => ({
  runVectorDoubleCheckDiscovery: mockRunVectorDoubleCheckDiscovery,
}))

vi.mock("@/backend/workers/env-utils", async () => {
  const actual = await vi.importActual<typeof import("@/backend/workers/env-utils")>(
    "@/backend/workers/env-utils"
  )

  return {
    ...actual,
    requireSupabaseEnv: vi.fn(),
  }
})

const embeddingResult = {
  mode: "queue" as const,
  result: {
    cycles: 1,
    totalRequeued: 0,
    totalClaimed: 3,
    totalCompleted: 3,
    totalFailed: 0,
  },
}

const discoveryResult = {
  cycles: 1,
  totalDiscovered: 4,
  totalLogged: 3,
  totalSkipped: 1,
}

const baseConfig: VectorDoubleCheckWorkerConfig = {
  batchLimit: 100,
  maxCycles: 0,
  workerIntervalSeconds: 3600,
  similarityThreshold: 0.88,
  embeddingModel: "text-embedding-3-small",
  dryRun: false,
}

describe("runVectorDoubleCheckPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    mockRunEmbeddingWorker.mockResolvedValue(embeddingResult)
    mockRunVectorDoubleCheckDiscovery.mockResolvedValue(discoveryResult)
  })

  it("runs embedding queue before vector discovery", async () => {
    const summary = await runVectorDoubleCheckPipeline(baseConfig)

    expect(summary).toEqual({
      embeddingQueue: embeddingResult.result,
      vectorDiscovery: discoveryResult,
    })

    const order = [
      mockRunEmbeddingWorker.mock.invocationCallOrder[0],
      mockRunVectorDoubleCheckDiscovery.mock.invocationCallOrder[0],
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("propagates vector dry-run and embedding model into the queue stage", async () => {
    await runVectorDoubleCheckPipeline({
      ...baseConfig,
      dryRun: true,
      embeddingModel: "nomic-embed-text",
    })

    expect(mockRunEmbeddingWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "queue",
        dryRun: true,
        embeddingModel: "nomic-embed-text",
        maxCycles: 0,
      })
    )
  })

  it("throws when the embedding worker returns a non-queue mode", async () => {
    mockRunEmbeddingWorker.mockResolvedValueOnce({
      mode: "probation-embedding",
      result: { totalFound: 1, totalEmbedded: 1, totalFailed: 0 },
    })

    await expect(runVectorDoubleCheckPipeline(baseConfig)).rejects.toThrow(
      "Expected embedding worker queue mode"
    )
    expect(mockRunVectorDoubleCheckDiscovery).not.toHaveBeenCalled()
  })
})
