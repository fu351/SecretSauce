import { beforeEach, describe, expect, it, vi } from "vitest"
import { runCanonicalPipeline } from "../pipeline"
import type { CanonicalPipelineConfig } from "../config"

const {
  mockRunEmbeddingWorker,
  mockRunVectorDoubleCheckDiscovery,
  mockRunCanonicalConsolidation,
} = vi.hoisted(() => ({
  mockRunEmbeddingWorker: vi.fn(),
  mockRunVectorDoubleCheckDiscovery: vi.fn(),
  mockRunCanonicalConsolidation: vi.fn(),
}))

vi.mock("@/backend/workers/embedding-worker/processor", () => ({
  runEmbeddingWorker: mockRunEmbeddingWorker,
}))

vi.mock("@/backend/workers/vector-double-check-worker/processor", () => ({
  runVectorDoubleCheckDiscovery: mockRunVectorDoubleCheckDiscovery,
}))

vi.mock("@/backend/workers/canonical-consolidation-worker/processor", () => ({
  runCanonicalConsolidation: mockRunCanonicalConsolidation,
}))

const probationResult = { totalFound: 5, totalEmbedded: 5, totalFailed: 0 }
const discoveryResult = { cycles: 1, totalDiscovered: 3, totalLogged: 2, totalSkipped: 1 }
const consolidationResult = { cycles: 1, totalConsidered: 2, totalConsolidated: 1, totalSkipped: 1, totalFailed: 0 }

const baseConfig: CanonicalPipelineConfig = {
  dryRun: false,
  stopOnStageError: true,
  workerIntervalSeconds: 86400,
  enableProbationEmbedding: true,
  enableVectorDiscovery: true,
  enableConsolidation: true,
  probationBatchLimit: 100,
  probationMinDistinctSources: 1,
  ollamaBaseUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  vectorSimilarityThreshold: 0.88,
  vectorBatchLimit: 100,
  vectorEmbeddingModel: "text-embedding-3-small",
  consolidationMinSimilarity: 0.92,
  consolidationMinEventCount: 2,
  consolidationBatchLimit: 50,
  consolidationEnableClusterPlanning: false,
  consolidationWeightedSimilarityThreshold: 0.97,
  consolidationMinWeightedProductCount: 5,
}

describe("runCanonicalPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    mockRunEmbeddingWorker.mockResolvedValue({ mode: "probation-embedding", result: probationResult })
    mockRunVectorDoubleCheckDiscovery.mockResolvedValue(discoveryResult)
    mockRunCanonicalConsolidation.mockResolvedValue(consolidationResult)
  })

  it("runs all three stages in order when all enabled", async () => {
    const summary = await runCanonicalPipeline(baseConfig)

    expect(summary.probationEmbedding).toEqual(probationResult)
    expect(summary.vectorDiscovery).toEqual(discoveryResult)
    expect(summary.consolidation).toEqual(consolidationResult)
    expect(summary.stageErrors).toEqual([])

    // Verify call order
    const order = [
      mockRunEmbeddingWorker.mock.invocationCallOrder[0],
      mockRunVectorDoubleCheckDiscovery.mock.invocationCallOrder[0],
      mockRunCanonicalConsolidation.mock.invocationCallOrder[0],
    ]
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("skips disabled stages and leaves them null in summary", async () => {
    const summary = await runCanonicalPipeline({
      ...baseConfig,
      enableProbationEmbedding: false,
      enableVectorDiscovery: false,
    })

    expect(summary.probationEmbedding).toBeNull()
    expect(summary.vectorDiscovery).toBeNull()
    expect(summary.consolidation).toEqual(consolidationResult)
    expect(mockRunEmbeddingWorker).not.toHaveBeenCalled()
    expect(mockRunVectorDoubleCheckDiscovery).not.toHaveBeenCalled()
    expect(mockRunCanonicalConsolidation).toHaveBeenCalledTimes(1)
  })

  it("stopOnStageError=true — stage 1 throws, stages 2 and 3 not called", async () => {
    mockRunEmbeddingWorker.mockRejectedValueOnce(new Error("Ollama down"))

    await expect(runCanonicalPipeline({ ...baseConfig, stopOnStageError: true })).rejects.toThrow("Ollama down")

    expect(mockRunVectorDoubleCheckDiscovery).not.toHaveBeenCalled()
    expect(mockRunCanonicalConsolidation).not.toHaveBeenCalled()
  })

  it("stopOnStageError=false — stage 1 throws, stages 2 and 3 still run", async () => {
    mockRunEmbeddingWorker.mockRejectedValueOnce(new Error("Ollama down"))

    const summary = await runCanonicalPipeline({ ...baseConfig, stopOnStageError: false })

    expect(summary.probationEmbedding).toBeNull()
    expect(summary.vectorDiscovery).toEqual(discoveryResult)
    expect(summary.consolidation).toEqual(consolidationResult)
    expect(summary.stageErrors).toEqual(["probation-embedding: Ollama down"])
  })

  it("propagates dryRun=true into embedding worker config", async () => {
    await runCanonicalPipeline({ ...baseConfig, dryRun: true })

    expect(mockRunEmbeddingWorker).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, mode: "probation-embedding" })
    )
    expect(mockRunVectorDoubleCheckDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true })
    )
    expect(mockRunCanonicalConsolidation).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true })
    )
  })

  it("collects multiple stage errors when stopOnStageError=false", async () => {
    mockRunEmbeddingWorker.mockRejectedValueOnce(new Error("Ollama down"))
    mockRunVectorDoubleCheckDiscovery.mockRejectedValueOnce(new Error("DB timeout"))

    const summary = await runCanonicalPipeline({ ...baseConfig, stopOnStageError: false })

    expect(summary.stageErrors).toEqual([
      "probation-embedding: Ollama down",
      "vector-discovery: DB timeout",
    ])
    expect(summary.consolidation).toEqual(consolidationResult)
  })
})
