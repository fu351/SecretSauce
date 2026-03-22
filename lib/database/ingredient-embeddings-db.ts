import { supabase } from "./supabase"

export interface VectorDoubleCheckCandidateRow {
  source_canonical: string
  target_canonical: string
  source_category: string | null
  target_category: string | null
  similarity: number
}

export interface VectorMatchRow {
  matched_id: string
  matched_name: string
  confidence: number
  match_strategy: string
  matched_category: string | null
  embedding_model: string
}

class IngredientEmbeddingsDB {
  private static instance: IngredientEmbeddingsDB | null = null

  static getInstance(): IngredientEmbeddingsDB {
    if (!IngredientEmbeddingsDB.instance) {
      IngredientEmbeddingsDB.instance = new IngredientEmbeddingsDB()
    }
    return IngredientEmbeddingsDB.instance
  }

  async matchVector(params: {
    embedding: number[]
    limit?: number
    model?: string
    highConfidenceThreshold?: number
    midConfidenceThreshold?: number
  }): Promise<VectorMatchRow[]> {
    const { data, error } = await (supabase.rpc as any)("fn_match_ingredient_vector", {
      p_embedding: params.embedding,
      p_limit: params.limit ?? 25,
      p_model: params.model ?? "text-embedding-3-small",
      p_high_confidence_threshold: params.highConfidenceThreshold ?? 0.93,
      p_mid_confidence_threshold: params.midConfidenceThreshold ?? 0.8,
    })

    if (error) {
      console.error("[IngredientEmbeddingsDB] matchVector error:", error.message)
      return []
    }

    return ((data as any[]) || []).map((row) => ({
      matched_id: String(row.matched_id ?? ""),
      matched_name: String(row.matched_name ?? ""),
      confidence: Number(row.confidence ?? 0),
      match_strategy: String(row.match_strategy ?? "vector_low"),
      matched_category: row.matched_category != null ? String(row.matched_category) : null,
      embedding_model: String(row.embedding_model ?? ""),
    }))
  }

  async findDoubleCheckCandidates(params: {
    threshold?: number
    limit?: number
    model?: string
  }): Promise<VectorDoubleCheckCandidateRow[]> {
    const { data, error } = await (supabase.rpc as any)("fn_find_vector_double_check_candidates", {
      p_threshold: params.threshold ?? 0.88,
      p_limit: params.limit ?? 100,
      p_model: params.model ?? "text-embedding-3-small",
    })

    if (error) {
      console.error("[IngredientEmbeddingsDB] findDoubleCheckCandidates error:", error.message)
      return []
    }

    return ((data as any[]) || []).map((row) => ({
      source_canonical: String(row.source_canonical ?? ""),
      target_canonical: String(row.target_canonical ?? ""),
      source_category: row.source_category != null ? String(row.source_category) : null,
      target_category: row.target_category != null ? String(row.target_category) : null,
      similarity: Number(row.similarity ?? 0),
    }))
  }
}

export const ingredientEmbeddingsDB = IngredientEmbeddingsDB.getInstance()
