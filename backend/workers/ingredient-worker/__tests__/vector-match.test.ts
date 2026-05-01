import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  matchVector: vi.fn(),
  fetchEmbeddingsFromOllama: vi.fn(),
}))

vi.mock("../../../../lib/database/ingredient-embeddings-db", () => ({
  ingredientEmbeddingsDB: {
    matchVector: mocks.matchVector,
  },
}))

vi.mock("../../../../lib/ollama/embeddings", () => ({
  fetchEmbeddingsFromOllama: mocks.fetchEmbeddingsFromOllama,
}))

describe("vector-match reranking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchEmbeddingsFromOllama.mockResolvedValue([[0.1, 0.2, 0.3]])
  })

  it("prefers bocconcini mozzarella over string cheese for fresh bocconcini mozzarella", async () => {
    mocks.matchVector.mockResolvedValue([
      {
        matched_id: "a",
        matched_name: "bocconcini mozzarella",
        confidence: 0.83,
        matched_category: "dairy",
        embedding_model: "test-model",
      },
      {
        matched_id: "b",
        matched_name: "Low-Moisture Part-Skim Mozzarella String Cheese",
        confidence: 0.87,
        matched_category: "dairy",
        embedding_model: "test-model",
      },
    ])

    const { resolveVectorMatch } = await import("../scoring/vector-match")

    const result = await resolveVectorMatch("fresh bocconcini mozzarella, sliced", "test-model", "dairy")

    expect(result?.matchedName).toBe("bocconcini mozzarella")
  })

  it("prefers basil over a tomato product that only mentions basil as an accent", async () => {
    mocks.matchVector.mockResolvedValue([
      {
        matched_id: "a",
        matched_name: "basil",
        confidence: 0.82,
        matched_category: "produce",
        embedding_model: "test-model",
      },
      {
        matched_id: "b",
        matched_name: "Italian Whole Peeled Tomatoes with Basil Leaf",
        confidence: 0.87,
        matched_category: "pantry_staples",
        embedding_model: "test-model",
      },
    ])

    const { resolveVectorMatch } = await import("../scoring/vector-match")

    const result = await resolveVectorMatch("fresh basil leaves", "test-model", "produce")

    expect(result?.matchedName).toBe("basil")
  })

  it("prefers olive oil over a long carrier product that merely contains olive oil", async () => {
    mocks.matchVector.mockResolvedValue([
      {
        matched_id: "a",
        matched_name: "olive oil",
        confidence: 0.84,
        matched_category: "pantry_staples",
        embedding_model: "test-model",
      },
      {
        matched_id: "b",
        matched_name: "Lightly Smoked Sardines in Olive Oil 4.25 Oz",
        confidence: 0.89,
        matched_category: "meat_seafood",
        embedding_model: "test-model",
      },
    ])

    const { resolveVectorMatch } = await import("../scoring/vector-match")

    const result = await resolveVectorMatch("olive oil, plus more", "test-model", "pantry_staples")

    expect(result?.matchedName).toBe("olive oil")
  })
})
