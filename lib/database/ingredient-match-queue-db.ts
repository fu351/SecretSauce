import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

export type IngredientMatchQueueStatus = "pending" | "processing" | "resolved" | "failed"
export type IngredientMatchQueueRow = Database["public"]["Tables"]["ingredient_match_queue"]["Row"]
export type IngredientMatchQueueInsert = Database["public"]["Tables"]["ingredient_match_queue"]["Insert"]
export type IngredientMatchQueueUpdate = Database["public"]["Tables"]["ingredient_match_queue"]["Update"]

class IngredientMatchQueueTable extends BaseTable<
  "ingredient_match_queue",
  IngredientMatchQueueRow,
  IngredientMatchQueueInsert,
  IngredientMatchQueueUpdate
> {
  private static instance: IngredientMatchQueueTable | null = null
  readonly tableName = "ingredient_match_queue" as const

  private constructor() {
    super()
  }

  static getInstance(): IngredientMatchQueueTable {
    if (!IngredientMatchQueueTable.instance) {
      IngredientMatchQueueTable.instance = new IngredientMatchQueueTable()
    }

    return IngredientMatchQueueTable.instance
  }

  async fetchPending(limit = 25): Promise<IngredientMatchQueueRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit)

    if (error) {
      this.handleError(error, "fetchPending")
      return []
    }

    return data || []
  }

  async markProcessing(rowIds: string[], resolver?: string): Promise<boolean> {
    if (!rowIds.length) return true

    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "processing",
        resolved_by: resolver ?? null,
        resolved_at: null,
      })
      .in("id", rowIds)

    if (error) {
      this.handleError(error, "markProcessing")
      return false
    }

    return true
  }

  async markResolved(params: {
    rowId: string
    resolvedIngredientId: string
    canonicalName: string
    confidence: number
    resolver?: string
    bestFuzzyMatch?: string
  }): Promise<boolean> {
    const { rowId, resolvedIngredientId, canonicalName, confidence, resolver, bestFuzzyMatch } = params

    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "resolved",
        resolved_by: resolver ?? null,
        resolved_at: new Date().toISOString(),
        resolved_ingredient_id: resolvedIngredientId,
        best_fuzzy_match: bestFuzzyMatch ?? canonicalName,
        fuzzy_score: confidence,
      })
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markResolved")
      return false
    }

    return true
  }

  async markFailed(rowId: string, resolver?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "failed",
        resolved_by: resolver ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markFailed")
      return false
    }

    return true
  }
}

export const ingredientMatchQueueDB = IngredientMatchQueueTable.getInstance()
