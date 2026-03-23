import { beforeEach, describe, expect, it, vi } from "vitest"
import { runEmbeddingQueueResolver } from "../processor"
import type { EmbeddingWorkerConfig } from "../config"

const {
  mockFetchPending,
  mockClaimPending,
  mockRequeueExpired,
  mockUpsertRecipeEmbedding,
  mockUpsertIngredientEmbedding,
  mockMarkCompleted,
  mockMarkFailed,
  mockFetchEmbeddings,
} = vi.hoisted(() => ({
  mockFetchPending: vi.fn(),
  mockClaimPending: vi.fn(),
  mockRequeueExpired: vi.fn(),
  mockUpsertRecipeEmbedding: vi.fn(),
  mockUpsertIngredientEmbedding: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockFetchEmbeddings: vi.fn(),
}))

vi.mock("@/lib/database/embedding-queue-db", () => ({
  embeddingQueueDB: {
    fetchPending: mockFetchPending,
    claimPending: mockClaimPending,
    requeueExpired: mockRequeueExpired,
    upsertRecipeEmbedding: mockUpsertRecipeEmbedding,
    upsertIngredientEmbedding: mockUpsertIngredientEmbedding,
    markCompleted: mockMarkCompleted,
    markFailed: mockMarkFailed,
  },
}))

vi.mock("@/lib/openai/embeddings", () => ({
  fetchEmbeddings: mockFetchEmbeddings,
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
  resolverName: "embedding-queue-worker",
  batchLimit: 50,
  maxCycles: 0,
  leaseSeconds: 180,
  workerIntervalSeconds: 300,
  requeueLimit: 500,
  sourceType: "any",
  dryRun: false,
  embeddingProvider: "openai",
  embeddingModel: "text-embedding-3-small",
  ollamaBaseUrl: "http://localhost:11434",
  requestTimeoutMs: 30000,
}

describe("runEmbeddingQueueResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})

    mockFetchPending.mockResolvedValue([])
    mockClaimPending.mockResolvedValue([])
    mockRequeueExpired.mockResolvedValue(0)
    mockUpsertRecipeEmbedding.mockResolvedValue(true)
    mockUpsertIngredientEmbedding.mockResolvedValue(true)
    mockMarkCompleted.mockResolvedValue(true)
    mockMarkFailed.mockResolvedValue(true)
    mockFetchEmbeddings.mockResolvedValue([])
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
      model: "text-embedding-3-small",
    })

    expect(mockFetchPending).toHaveBeenCalledWith({ limit: 50, sourceType: "ingredient" })
    expect(mockClaimPending).not.toHaveBeenCalled()
    expect(mockFetchEmbeddings).not.toHaveBeenCalled()
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
    mockFetchEmbeddings.mockResolvedValueOnce([
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
    expect(mockFetchEmbeddings).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      inputTexts: ["Simple tomato soup", "tomato"],
      timeoutMs: 30000,
    })
    expect(mockUpsertRecipeEmbedding).toHaveBeenCalledWith({
      recipeId: "recipe-1",
      inputText: "Simple tomato soup",
      embedding: [0.1, 0.2],
      model: "text-embedding-3-small",
    })
    expect(mockUpsertIngredientEmbedding).toHaveBeenCalledWith({
      standardizedIngredientId: "ingredient-2",
      inputText: "tomato",
      embedding: [0.3, 0.4],
      model: "text-embedding-3-small",
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
    mockFetchEmbeddings.mockResolvedValueOnce([[0.11], [0.22]])

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
    mockFetchEmbeddings.mockRejectedValueOnce(new Error("OpenAI temporarily unavailable"))

    const summary = await runEmbeddingQueueResolver(baseConfig)

    expect(summary).toMatchObject({
      cycles: 1,
      totalClaimed: 2,
      totalCompleted: 0,
      totalFailed: 2,
    })
    expect(mockMarkFailed).toHaveBeenCalledTimes(2)
    expect(mockMarkFailed.mock.calls[0]).toEqual(["cycle-a", "OpenAI temporarily unavailable"])
    expect(mockMarkFailed.mock.calls[1]).toEqual(["cycle-b", "OpenAI temporarily unavailable"])
  })
})
