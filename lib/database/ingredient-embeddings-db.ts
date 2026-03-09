import { supabase } from "./supabase"

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
}

export const ingredientEmbeddingsDB = IngredientEmbeddingsDB.getInstance()
