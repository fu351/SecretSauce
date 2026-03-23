import { beforeEach, describe, expect, it, vi } from "vitest"
import { runVectorDoubleCheckDiscovery } from "../processor"
import type { VectorDoubleCheckWorkerConfig } from "../config"

const { mockFindDoubleCheckCandidates, mockLogCanonicalDoubleCheckDaily, mockResolveRemapDirection } = vi.hoisted(
  () => ({
    mockFindDoubleCheckCandidates: vi.fn(),
    mockLogCanonicalDoubleCheckDaily: vi.fn(),
    mockResolveRemapDirection: vi.fn(),
  })
)

vi.mock("@/lib/database/ingredient-embeddings-db", () => ({
  ingredientEmbeddingsDB: {
    findDoubleCheckCandidates: mockFindDoubleCheckCandidates,
  },
}))

vi.mock("@/lib/database/ingredient-match-queue-db", () => ({
  ingredientMatchQueueDB: {
    logCanonicalDoubleCheckDaily: mockLogCanonicalDoubleCheckDaily,
  },
}))

vi.mock("@/queue/ingredient-worker/canonical/double-check", () => ({
  resolveRemapDirection: mockResolveRemapDirection,
}))

function buildCandidate(overrides?: Record<string, unknown>) {
  return {
    source_canonical: "milk",
    target_canonical: "whole milk",
    source_category: "dairy",
    target_category: "dairy",
    similarity: 0.92,
    ...overrides,
  }
}

const baseConfig: VectorDoubleCheckWorkerConfig = {
  batchLimit: 100,
  maxCycles: 0,
  workerIntervalSeconds: 3600,
  similarityThreshold: 0.88,
  embeddingModel: "text-embedding-3-small",
  dryRun: false,
}

describe("runVectorDoubleCheckDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    mockFindDoubleCheckCandidates.mockResolvedValue([])
    mockLogCanonicalDoubleCheckDaily.mockResolvedValue(true)
    mockResolveRemapDirection.mockReturnValue("lateral")
  })

  it("reports discovered candidates in dry-run mode without logging", async () => {
    mockFindDoubleCheckCandidates.mockResolvedValueOnce([
      buildCandidate({ source_canonical: "milk", target_canonical: "whole milk", similarity: 0.96 }),
      buildCandidate({ source_canonical: "apple", target_canonical: "green apple", similarity: 0.91 }),
    ])

    const summary = await runVectorDoubleCheckDiscovery({
      ...baseConfig,
      dryRun: true,
      maxCycles: 5,
    })

    expect(summary).toEqual({
      cycles: 1,
      totalDiscovered: 2,
      totalLogged: 0,
      totalSkipped: 2,
    })
    expect(mockFindDoubleCheckCandidates).toHaveBeenCalledWith({
      threshold: 0.88,
      limit: 100,
      model: "text-embedding-3-small",
    })
    expect(mockResolveRemapDirection).toHaveBeenCalledTimes(2)
    expect(mockLogCanonicalDoubleCheckDaily).not.toHaveBeenCalled()
  })

  it("logs candidates with reason=vector_candidate_discovery and tracks failed writes as skipped", async () => {
    mockFindDoubleCheckCandidates.mockResolvedValueOnce([
      buildCandidate({ source_canonical: "milk", target_canonical: "whole milk", similarity: 0.97 }),
      buildCandidate({ source_canonical: "onion", target_canonical: "green onion", similarity: 0.9 }),
    ])
    mockResolveRemapDirection
      .mockReturnValueOnce("generic_to_specific")
      .mockReturnValueOnce("lateral")
    mockLogCanonicalDoubleCheckDaily.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const summary = await runVectorDoubleCheckDiscovery({
      ...baseConfig,
      maxCycles: 1,
    })

    expect(summary).toEqual({
      cycles: 1,
      totalDiscovered: 2,
      totalLogged: 1,
      totalSkipped: 1,
    })
    expect(mockLogCanonicalDoubleCheckDaily).toHaveBeenNthCalledWith(1, {
      sourceCanonical: "milk",
      targetCanonical: "whole milk",
      decision: "skipped",
      reason: "vector_candidate_discovery",
      direction: "generic_to_specific",
      aiConfidence: null,
      similarity: 0.97,
      sourceCategory: "dairy",
      targetCategory: "dairy",
    })
    expect(mockLogCanonicalDoubleCheckDaily).toHaveBeenNthCalledWith(2, {
      sourceCanonical: "onion",
      targetCanonical: "green onion",
      decision: "skipped",
      reason: "vector_candidate_discovery",
      direction: "lateral",
      aiConfidence: null,
      similarity: 0.9,
      sourceCategory: "dairy",
      targetCategory: "dairy",
    })
  })

  it("honors maxCycles even when each cycle returns a full batch", async () => {
    mockFindDoubleCheckCandidates
      .mockResolvedValueOnce([
        buildCandidate({ source_canonical: "a", target_canonical: "a1", similarity: 0.9 }),
        buildCandidate({ source_canonical: "b", target_canonical: "b1", similarity: 0.91 }),
      ])
      .mockResolvedValueOnce([
        buildCandidate({ source_canonical: "c", target_canonical: "c1", similarity: 0.92 }),
        buildCandidate({ source_canonical: "d", target_canonical: "d1", similarity: 0.93 }),
      ])
      .mockResolvedValueOnce([])

    const summary = await runVectorDoubleCheckDiscovery({
      ...baseConfig,
      dryRun: true,
      batchLimit: 2,
      maxCycles: 2,
    })

    expect(summary).toEqual({
      cycles: 2,
      totalDiscovered: 4,
      totalLogged: 0,
      totalSkipped: 4,
    })
    expect(mockFindDoubleCheckCandidates).toHaveBeenCalledTimes(2)
  })
})
