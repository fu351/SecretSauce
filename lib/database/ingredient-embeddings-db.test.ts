import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock("./supabase", () => ({
  supabase: {
    rpc: mockRpc,
  },
}))

import { ingredientEmbeddingsDB } from "./ingredient-embeddings-db"

describe("ingredientEmbeddingsDB", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("maps vector match rows and applies RPC defaults", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          matched_id: 123,
          matched_name: "Tomato",
          confidence: "0.942",
          match_strategy: null,
          matched_category: 77,
          embedding_model: null,
        },
      ],
      error: null,
    })

    const matches = await ingredientEmbeddingsDB.matchVector({
      embedding: [0.1, 0.2, 0.3],
    })

    expect(mockRpc).toHaveBeenCalledWith("fn_match_ingredient_vector", {
      p_embedding: [0.1, 0.2, 0.3],
      p_limit: 25,
      p_model: "text-embedding-3-small",
      p_high_confidence_threshold: 0.93,
      p_mid_confidence_threshold: 0.8,
    })
    expect(matches).toEqual([
      {
        matched_id: "123",
        matched_name: "Tomato",
        confidence: 0.942,
        match_strategy: "vector_low",
        matched_category: "77",
        embedding_model: "",
      },
    ])
  })

  it("returns an empty array when vector match RPC fails", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc failed" },
    })

    const matches = await ingredientEmbeddingsDB.matchVector({
      embedding: [0.5],
      model: "text-embedding-3-large",
    })

    expect(matches).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      "[IngredientEmbeddingsDB] matchVector error:",
      "rpc failed"
    )
  })

  it("maps candidate discovery rows and forwards explicit params", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          source_canonical: "milk",
          target_canonical: "whole milk",
          source_category: null,
          target_category: "dairy",
          similarity: "0.96",
        },
      ],
      error: null,
    })

    const candidates = await ingredientEmbeddingsDB.findDoubleCheckCandidates({
      threshold: 0.9,
      limit: 12,
      model: "text-embedding-3-large",
    })

    expect(mockRpc).toHaveBeenCalledWith("fn_find_vector_double_check_candidates", {
      p_threshold: 0.9,
      p_limit: 12,
      p_model: "text-embedding-3-large",
    })
    expect(candidates).toEqual([
      {
        source_canonical: "milk",
        target_canonical: "whole milk",
        source_category: null,
        target_category: "dairy",
        similarity: 0.96,
      },
    ])
  })

  it("returns an empty array when candidate discovery RPC fails", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "candidate rpc failed" },
    })

    const candidates = await ingredientEmbeddingsDB.findDoubleCheckCandidates({})

    expect(candidates).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      "[IngredientEmbeddingsDB] findDoubleCheckCandidates error:",
      "candidate rpc failed"
    )
  })
})
