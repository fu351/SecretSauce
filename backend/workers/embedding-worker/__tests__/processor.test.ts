import { beforeEach, describe, expect, it, vi } from "vitest"
import { runEmbeddingQueueResolver, runEmbeddingWorker } from "../processor"
import type { EmbeddingWorkerConfig } from "../config"

const {
  mockFetchPending,
  mockClaimPending,
  mockRequeueExpired,
  mockUpsertRecipeEmbedding,
  mockUpsertIngredientEmbedding,
  mockUpsertCandidateEmbedding,
  mockMarkCompleted,
  mockMarkFailed,
  mockFetchEmbeddingsWithResourcePlan,
  mockFetchCandidateEmbeddingsByInputTexts,
  mockFetchProbationCanonicalsWithoutEmbedding,
} = vi.hoisted(() => ({
  mockFetchPending: vi.fn(),
  mockClaimPending: vi.fn(),
  mockRequeueExpired: vi.fn(),
  mockUpsertRecipeEmbedding: vi.fn(),
  mockUpsertIngredientEmbedding: vi.fn(),
  mockUpsertCandidateEmbedding: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockFetchEmbeddingsWithResourcePlan: vi.fn(),
  mockFetchCandidateEmbeddingsByInputTexts: vi.fn(),
  mockFetchProbationCanonicalsWithoutEmbedding: vi.fn(),
}))

vi.mock("../embedding-queue-db", () => ({
  embeddingQueueDB: {
    fetchPending: mockFetchPending,
    claimPending: mockClaimPending,
    requeueExpired: mockRequeueExpired,
    upsertRecipeEmbedding: mockUpsertRecipeEmbedding,
    upsertIngredientEmbedding: mockUpsertIngredientEmbedding,
    upsertCandidateEmbedding: mockUpsertCandidateEmbedding,
    markCompleted: mockMarkCompleted,
    markFailed: mockMarkFailed,
    fetchCandidateEmbeddingsByInputTexts: mockFetchCandidateEmbeddingsByInputTexts,
  },
}))

vi.mock("../batching-resources", () => ({
  fetchEmbeddingsWithResourcePlan: mockFetchEmbeddingsWithResourcePlan,
}))

vi.mock("@/lib/database/canonical-consolidation-db", () => ({
  canonicalConsolidationDB: {
    fetchProbationCanonicalsWithoutEmbedding: mockFetchProbationCanonicalsWithoutEmbedding,
  },
}))

function buildRow(overrides?: Record<string, unknown>) {
  return {
    id: "row-1",
    source_type: "ingredient",
    source_id: "ingredient-1",
    input_text: "fresh tomato",
    model: null,
    status: "pending",
    attempt_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    processing_started_at: null,
    processing_lease_expires_at: null,
    last_error: null,
    ...overrides,
  } as any
}

const baseConfig: EmbeddingWorkerConfig = {
  mode: "queue",
  resolverName: "embedding-queue-pipeline",
  batchLimit: 50,
  maxCycles: 0,
  leaseSeconds: 180,
  workerIntervalSeconds: 300,
  requeueLimit: 500,
  sourceType: "any",
  dryRun: false,
  embeddingModel: "nomic-embed-text",
  ollamaBaseUrl: "http://localhost:11434",
  requestTimeoutMs: 30000,
  probationBatchLimit: 100,
  probationMinDistinctSources: 1,
}

describe("runEmbeddingQueueResolver", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})

    mockFetchPending.mockResolvedValue([])
    mockClaimPending.mockResolvedValue([])
    mockRequeueExpired.mockResolvedValue(0)
    mockUpsertRecipeEmbedding.mockResolvedValue(true)
    mockUpsertIngredientEmbedding.mockResolvedValue(true)
    mockUpsertCandidateEmbedding.mockResolvedValue(true)
    mockMarkCompleted.mockResolvedValue(true)
    mockMarkFailed.mockResolvedValue(true)
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValue([])
    mockFetchCandidateEmbeddingsByInputTexts.mockResolvedValue(new Map())
  })

  it("returns dry-run previews without writing embeddings", async () => {
    mockFetchPending.mockResolvedValueOnce([
      buildRow({
        id: "dry-1",
        source_type: "ingredient",
        source_id: "ing-10",
        input_text: "  roma    tomato   ",
      }),
    ])

    const summary = await runEmbeddingQueueResolver({
      ...baseConfig,
      dryRun: true,
      sourceType: "ingredient",
    })

    expect(summary).toMatchObject({
      cycles: 1,
      totalRequeued: 0,
      totalClaimed: 1,
      totalCompleted: 1,
      totalFailed: 0,
    })
    expect(summary.dryRunRows?.[0]).toMatchObject({
      id: "dry-1",
      sourceType: "ingredient",
      sourceId: "ing-10",
      inputPreview: "roma tomato",
      model: "nomic-embed-text",
    })

    expect(mockFetchPending).toHaveBeenCalledWith({ limit: 50, sourceType: "ingredient" })
    expect(mockClaimPending).not.toHaveBeenCalled()
    expect(mockFetchEmbeddingsWithResourcePlan).not.toHaveBeenCalled()
    expect(mockMarkCompleted).not.toHaveBeenCalled()
    expect(mockMarkFailed).not.toHaveBeenCalled()
  })

  it("processes claimed recipe and ingredient rows and marks them complete", async () => {
    const recipeRow = buildRow({
      id: "recipe-row",
      source_type: "recipe",
      source_id: "recipe-1",
      input_text: "Simple tomato soup",
    })
    const ingredientRow = buildRow({
      id: "ingredient-row",
      source_type: "ingredient",
      source_id: "ingredient-2",
      input_text: "tomato",
    })

    mockRequeueExpired.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    mockClaimPending.mockResolvedValueOnce([recipeRow, ingredientRow]).mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([
      [0.1, 0.2],
      [0.3, 0.4],
    ])

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({
      cycles: 1,
      totalRequeued: 2,
      totalClaimed: 2,
      totalCompleted: 2,
      totalFailed: 0,
    })

    expect(mockClaimPending).toHaveBeenCalledWith({
      limit: 50,
      leaseSeconds: 180,
      sourceType: "any",
    })
    expect(mockFetchEmbeddingsWithResourcePlan).toHaveBeenCalledWith({
      model: "nomic-embed-text",
      inputTexts: ["Simple tomato soup", "tomato"],
      timeoutMs: 30000,
      baseUrl: "http://localhost:11434",
      maxItems: 50,
      logPrefix: "[EmbeddingQueueResolver]",
    })
    expect(mockUpsertRecipeEmbedding).toHaveBeenCalledWith({
      recipeId: "recipe-1",
      inputText: "Simple tomato soup",
      embedding: [0.1, 0.2],
      model: "nomic-embed-text",
    })
    expect(mockUpsertIngredientEmbedding).toHaveBeenCalledWith({
      standardizedIngredientId: "ingredient-2",
      inputText: "tomato",
      embedding: [0.3, 0.4],
      model: "nomic-embed-text",
    })
    expect(mockMarkCompleted).toHaveBeenCalledTimes(2)
    expect(mockMarkFailed).not.toHaveBeenCalled()
  })

  it("marks individual rows failed when write/completion operations fail", async () => {
    const rowA = buildRow({
      id: "row-a",
      source_type: "recipe",
      source_id: "recipe-a",
      input_text: "A",
    })
    const rowB = buildRow({
      id: "row-b",
      source_type: "ingredient",
      source_id: "ingredient-b",
      input_text: "B",
    })

    mockClaimPending.mockResolvedValueOnce([rowA, rowB]).mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([[0.11], [0.22]])

    mockUpsertRecipeEmbedding.mockResolvedValueOnce(true)
    mockMarkCompleted.mockResolvedValueOnce(false)
    mockUpsertIngredientEmbedding.mockResolvedValueOnce(false)

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({
      cycles: 1,
      totalClaimed: 2,
      totalCompleted: 0,
      totalFailed: 2,
    })

    expect(mockMarkFailed).toHaveBeenCalledTimes(2)
    expect(mockMarkFailed.mock.calls[0]?.[0]).toBe("row-a")
    expect(String(mockMarkFailed.mock.calls[0]?.[1])).toContain("Queue completion update failed")
    expect(mockMarkFailed.mock.calls[1]?.[0]).toBe("row-b")
    expect(String(mockMarkFailed.mock.calls[1]?.[1])).toContain("Embedding write failed")
  })

  it("marks all claimed rows failed when the batch embedding request throws", async () => {
    const rowA = buildRow({ id: "cycle-a", source_id: "ingredient-a" })
    const rowB = buildRow({ id: "cycle-b", source_id: "ingredient-b" })

    mockClaimPending.mockResolvedValueOnce([rowA, rowB]).mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan.mockRejectedValueOnce(new Error("Ollama temporarily unavailable"))

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({
      cycles: 1,
      totalClaimed: 2,
      totalCompleted: 0,
      totalFailed: 2,
    })
    expect(mockMarkFailed).toHaveBeenCalledTimes(2)
    expect(mockMarkFailed.mock.calls[0]).toEqual(["cycle-a", "Ollama temporarily unavailable"])
    expect(mockMarkFailed.mock.calls[1]).toEqual(["cycle-b", "Ollama temporarily unavailable"])
  })

  it("routes canonical_candidate rows to upsertCandidateEmbedding", async () => {
    const row = buildRow({
      id: "candidate-row",
      source_type: "canonical_candidate",
      source_id: "garlic powder",
      input_text: "garlic powder",
    })

    mockClaimPending.mockResolvedValueOnce([row]).mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([[0.5, 0.6]])

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({ totalCompleted: 1, totalFailed: 0 })
    expect(mockUpsertCandidateEmbedding).toHaveBeenCalledWith({
      canonicalName: "garlic powder",
      inputText: "garlic powder",
      embedding: [0.5, 0.6],
      model: "nomic-embed-text",
    })
    expect(mockUpsertRecipeEmbedding).not.toHaveBeenCalled()
    expect(mockUpsertIngredientEmbedding).not.toHaveBeenCalled()
  })

  it("skips Ollama entirely when all rows are cache hits", async () => {
    const rowA = buildRow({ id: "a", source_type: "canonical_candidate", source_id: "salt", input_text: "salt" })
    const rowB = buildRow({ id: "b", source_type: "canonical_candidate", source_id: "pepper", input_text: "pepper" })

    mockClaimPending.mockResolvedValueOnce([rowA, rowB]).mockResolvedValueOnce([])
    mockFetchCandidateEmbeddingsByInputTexts.mockResolvedValueOnce(
      new Map([
        ["salt", [0.1, 0.2]],
        ["pepper", [0.3, 0.4]],
      ])
    )

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({ totalCompleted: 2, totalFailed: 0 })
    expect(mockFetchEmbeddingsWithResourcePlan).not.toHaveBeenCalled()
    expect(mockUpsertCandidateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: "salt", embedding: [0.1, 0.2] })
    )
    expect(mockUpsertCandidateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: "pepper", embedding: [0.3, 0.4] })
    )
  })

  it("sends only cache-miss texts to Ollama and correctly assembles embeddings for all rows", async () => {
    // rowA: cache hit; rowB: miss; rowC: cache hit — interleaved to exercise index mapping
    const rowA = buildRow({ id: "a", source_type: "canonical_candidate", source_id: "salt", input_text: "salt" })
    const rowB = buildRow({ id: "b", source_type: "ingredient", source_id: "ing-1", input_text: "fresh basil" })
    const rowC = buildRow({ id: "c", source_type: "canonical_candidate", source_id: "pepper", input_text: "pepper" })

    mockClaimPending.mockResolvedValueOnce([rowA, rowB, rowC]).mockResolvedValueOnce([])
    mockFetchCandidateEmbeddingsByInputTexts.mockResolvedValueOnce(
      new Map([
        ["salt", [1.0, 0.0]],
        ["pepper", [0.0, 1.0]],
      ])
    )
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([[0.5, 0.5]])

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({ totalCompleted: 3, totalFailed: 0 })

    // Only the miss (fresh basil) should be sent to Ollama
    expect(mockFetchEmbeddingsWithResourcePlan).toHaveBeenCalledWith(
      expect.objectContaining({ inputTexts: ["fresh basil"] })
    )

    // Each row should receive its correct vector
    expect(mockUpsertCandidateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: "salt", embedding: [1.0, 0.0] })
    )
    expect(mockUpsertIngredientEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ standardizedIngredientId: "ing-1", embedding: [0.5, 0.5] })
    )
    expect(mockUpsertCandidateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: "pepper", embedding: [0.0, 1.0] })
    )
  })

  it("stops after maxCycles even when the queue still has rows", async () => {
    const row = buildRow({ id: "row-1" })
    // Return a row on every claim — queue never drains naturally
    mockClaimPending.mockResolvedValue([row])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValue([[0.1]])

    const summary = await runEmbeddingQueueResolver({ ...baseConfig, maxCycles: 2 })

    expect(summary.cycles).toBe(2)
    expect(mockClaimPending).toHaveBeenCalledTimes(2)
  })

  it("drains the queue across multiple cycles and sums all counts", async () => {
    const rowA = buildRow({ id: "a", source_id: "ingredient-a", input_text: "basil" })
    const rowB = buildRow({ id: "b", source_id: "ingredient-b", input_text: "oregano" })

    mockRequeueExpired.mockResolvedValue(0)
    mockClaimPending
      .mockResolvedValueOnce([rowA])
      .mockResolvedValueOnce([rowB])
      .mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan
      .mockResolvedValueOnce([[0.1]])
      .mockResolvedValueOnce([[0.2]])

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({
      cycles: 2,
      totalClaimed: 2,
      totalCompleted: 2,
      totalFailed: 0,
    })
    expect(mockClaimPending).toHaveBeenCalledTimes(3)
  })

  it("calls requeueExpired once per cycle in live mode", async () => {
    const row = buildRow({ id: "r" })
    mockClaimPending
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValue([[0.1]])

    await runEmbeddingQueueResolver(baseConfig)

    // 3 claim attempts → 3 requeue calls (one before each claim)
    expect(mockRequeueExpired).toHaveBeenCalledTimes(3)
  })

  it("does not call requeueExpired in dry-run mode", async () => {
    mockFetchPending.mockResolvedValueOnce([buildRow()])

    await runEmbeddingQueueResolver({ ...baseConfig, dryRun: true })

    expect(mockRequeueExpired).not.toHaveBeenCalled()
  })

  it("passes sourceType filter through to claimPending", async () => {
    mockClaimPending.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await runEmbeddingQueueResolver({ ...baseConfig, sourceType: "recipe" })

    expect(mockClaimPending).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "recipe" })
    )
  })

  it("accumulates requeued count across cycles", async () => {
    const row = buildRow({ id: "r" })
    mockClaimPending.mockResolvedValueOnce([row]).mockResolvedValueOnce([])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([[0.1]])
    mockRequeueExpired.mockResolvedValueOnce(3).mockResolvedValueOnce(5)

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary.totalRequeued).toBe(8)
  })
})

describe("runEmbeddingWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})

    mockFetchPending.mockResolvedValue([])
    mockClaimPending.mockResolvedValue([])
    mockRequeueExpired.mockResolvedValue(0)
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValue([])
    mockFetchCandidateEmbeddingsByInputTexts.mockResolvedValue(new Map())
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValue([])
    mockUpsertCandidateEmbedding.mockResolvedValue(true)
  })

  it("mode=queue delegates to runEmbeddingQueueResolver and returns tagged result", async () => {
    const result = await runEmbeddingWorker({ ...baseConfig, mode: "queue" })

    expect(result.mode).toBe("queue")
    expect(result.result).toMatchObject({ cycles: 0 })
    expect(mockFetchProbationCanonicalsWithoutEmbedding).not.toHaveBeenCalled()
  })

  it("mode=probation-embedding calls fetchProbationCanonicalsWithoutEmbedding and embeds each canonical", async () => {
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValueOnce(["tilapia", "salmon"])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([[0.1, 0.2], [0.3, 0.4]])

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "probation-embedding" })

    expect(result.mode).toBe("probation-embedding")
    expect(result.result).toEqual({ totalFound: 2, totalEmbedded: 2, totalFailed: 0 })
    expect(mockFetchEmbeddingsWithResourcePlan).toHaveBeenCalledWith({
      model: "nomic-embed-text",
      inputTexts: ["tilapia", "salmon"],
      timeoutMs: 30000,
      baseUrl: "http://localhost:11434",
      maxItems: 100,
      logPrefix: "[EmbeddingWorker]",
    })
    expect(mockUpsertCandidateEmbedding).toHaveBeenCalledTimes(2)
    expect(mockClaimPending).not.toHaveBeenCalled()
  })

  it("mode=probation-embedding dry-run skips Ollama and upsert", async () => {
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValueOnce(["tilapia", "salmon"])

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "probation-embedding", dryRun: true })

    expect(result.mode).toBe("probation-embedding")
    expect(result.result).toEqual({ totalFound: 2, totalEmbedded: 0, totalFailed: 0 })
    expect(mockFetchEmbeddingsWithResourcePlan).not.toHaveBeenCalled()
    expect(mockUpsertCandidateEmbedding).not.toHaveBeenCalled()
  })

  it("mode=probation-embedding counts failed upserts", async () => {
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValueOnce(["tilapia"])
    mockFetchEmbeddingsWithResourcePlan.mockResolvedValueOnce([[0.1, 0.2]])
    mockUpsertCandidateEmbedding.mockResolvedValueOnce(false)

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "probation-embedding" })

    expect(result.result).toEqual({ totalFound: 1, totalEmbedded: 0, totalFailed: 1 })
  })

  it("mode=probation-embedding returns early with zero counts when no canonicals found", async () => {
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValueOnce([])

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "probation-embedding" })

    expect(result.result).toEqual({ totalFound: 0, totalEmbedded: 0, totalFailed: 0 })
    expect(mockFetchEmbeddingsWithResourcePlan).not.toHaveBeenCalled()
  })

  it("mode=probation-embedding processes canonicals in batches when count exceeds probationBatchLimit", async () => {
    const canonicals = Array.from({ length: 5 }, (_, i) => `item-${i}`)
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValueOnce(canonicals)
    // Two batches: first 3, then 2
    mockFetchEmbeddingsWithResourcePlan
      .mockResolvedValueOnce(canonicals.slice(0, 3).map(() => [0.1]))
      .mockResolvedValueOnce(canonicals.slice(3).map(() => [0.2]))

    const result = await runEmbeddingWorker({
      ...baseConfig,
      mode: "probation-embedding",
      probationBatchLimit: 3,
    })

    expect(result.result).toMatchObject({ totalFound: 5, totalEmbedded: 5, totalFailed: 0 })
    expect(mockFetchEmbeddingsWithResourcePlan).toHaveBeenCalledTimes(2)
    expect(mockFetchEmbeddingsWithResourcePlan).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ inputTexts: canonicals.slice(0, 3), maxItems: 3 })
    )
    expect(mockFetchEmbeddingsWithResourcePlan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ inputTexts: canonicals.slice(3), maxItems: 3 })
    )
  })

  it("mode=probation-embedding counts entire batch as failed when Ollama throws", async () => {
    mockFetchProbationCanonicalsWithoutEmbedding.mockResolvedValueOnce(["cod", "hake", "trout"])
    mockFetchEmbeddingsWithResourcePlan.mockRejectedValueOnce(new Error("Ollama down"))

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "probation-embedding" })

    expect(result.result).toMatchObject({ totalFound: 3, totalEmbedded: 0, totalFailed: 3 })
    expect(mockUpsertCandidateEmbedding).not.toHaveBeenCalled()
  })

  it("mode=queue-recipe delegates to queue resolver with sourceType=recipe", async () => {
    mockClaimPending.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "queue-recipe" })

    expect(result.mode).toBe("queue-recipe")
    expect(mockClaimPending).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "recipe" })
    )
    expect(mockFetchProbationCanonicalsWithoutEmbedding).not.toHaveBeenCalled()
  })

  it("mode=queue-product delegates to queue resolver with sourceType=ingredient", async () => {
    mockClaimPending.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "queue-product" })

    expect(result.mode).toBe("queue-product")
    expect(mockClaimPending).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "ingredient" })
    )
    expect(mockFetchProbationCanonicalsWithoutEmbedding).not.toHaveBeenCalled()
  })

  it("mode=queue-all delegates to queue resolver with sourceType=any", async () => {
    mockClaimPending.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await runEmbeddingWorker({ ...baseConfig, mode: "queue-all" })

    expect(result.mode).toBe("queue-all")
    expect(mockClaimPending).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "any" })
    )
    expect(mockFetchProbationCanonicalsWithoutEmbedding).not.toHaveBeenCalled()
  })

  it("mode=queue-all overrides sourceType regardless of config value", async () => {
    mockClaimPending.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await runEmbeddingWorker({ ...baseConfig, mode: "queue-all", sourceType: "recipe" })

    expect(mockClaimPending).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "any" })
    )
  })
})
