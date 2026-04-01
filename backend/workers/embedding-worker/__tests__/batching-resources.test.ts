import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  buildEmbeddingBatchResourcePlan,
  fetchEmbeddingsWithResourcePlan,
} from "../batching-resources"

const { mockFetchEmbeddingsFromOllama } = vi.hoisted(() => ({
  mockFetchEmbeddingsFromOllama: vi.fn(),
}))

vi.mock("../ollama-embeddings", () => ({
  fetchEmbeddingsFromOllama: mockFetchEmbeddingsFromOllama,
}))

describe("buildEmbeddingBatchResourcePlan", () => {
  it("splits batches when maxItems is reached", () => {
    const plan = buildEmbeddingBatchResourcePlan(["a", "b", "c", "d", "e"], {
      maxItems: 2,
      maxChars: 100,
    })

    expect(plan).toHaveLength(3)
    expect(plan.map((batch) => batch.inputTexts)).toEqual([["a", "b"], ["c", "d"], ["e"]])
  })

  it("splits batches when maxChars would be exceeded", () => {
    const plan = buildEmbeddingBatchResourcePlan(["short", "tiny", "x".repeat(12), "ok"], {
      maxItems: 10,
      maxChars: 15,
    })

    expect(plan).toHaveLength(3)
    expect(plan.map((batch) => batch.inputTexts)).toEqual([["short", "tiny"], ["xxxxxxxxxxxx"], ["ok"]])
  })

  it("keeps an oversized single text in its own batch", () => {
    const plan = buildEmbeddingBatchResourcePlan(["x".repeat(40)], {
      maxItems: 5,
      maxChars: 10,
    })

    expect(plan).toEqual([
      {
        startIndex: 0,
        inputTexts: ["x".repeat(40)],
        estimatedChars: 40,
      },
    ])
  })
})

describe("fetchEmbeddingsWithResourcePlan", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("preserves vector order across multiple planned batches", async () => {
    mockFetchEmbeddingsFromOllama
      .mockResolvedValueOnce([[1], [2]])
      .mockResolvedValueOnce([[3]])

    const vectors = await fetchEmbeddingsWithResourcePlan({
      model: "nomic-embed-text",
      inputTexts: ["alpha", "beta", "gamma"],
      timeoutMs: 30000,
      baseUrl: "http://localhost:11434",
      maxItems: 10,
      maxChars: 10,
    })

    expect(vectors).toEqual([[1], [2], [3]])
    expect(mockFetchEmbeddingsFromOllama).toHaveBeenCalledTimes(2)
    expect(mockFetchEmbeddingsFromOllama).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ inputTexts: ["alpha", "beta"] })
    )
    expect(mockFetchEmbeddingsFromOllama).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ inputTexts: ["gamma"] })
    )
  })
})
