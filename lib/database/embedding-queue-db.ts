import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

export type EmbeddingSourceType = "recipe" | "ingredient" | "canonical_candidate"
export type EmbeddingQueueStatus = "pending" | "processing" | "completed" | "failed"
export type EmbeddingQueueRow = Database["public"]["Tables"]["embedding_queue"]["Row"]
export type EmbeddingQueueInsert = Database["public"]["Tables"]["embedding_queue"]["Insert"]
export type EmbeddingQueueUpdate = Database["public"]["Tables"]["embedding_queue"]["Update"]
export type RecipeEmbeddingInsert = Database["public"]["Tables"]["recipe_embeddings"]["Insert"]
export type IngredientEmbeddingInsert = Database["public"]["Tables"]["ingredient_embeddings"]["Insert"]

export type EmbeddingQueueEnqueueResult = "inserted" | "updated" | "failed"

class EmbeddingQueueTable extends BaseTable<
  "embedding_queue",
  EmbeddingQueueRow,
  EmbeddingQueueInsert,
  EmbeddingQueueUpdate
> {
  private static instance: EmbeddingQueueTable | null = null
  readonly tableName = "embedding_queue" as const

  private constructor() {
    super()
  }

  static getInstance(): EmbeddingQueueTable {
    if (!EmbeddingQueueTable.instance) {
      EmbeddingQueueTable.instance = new EmbeddingQueueTable()
    }
    return EmbeddingQueueTable.instance
  }

  async fetchPending(params?: {
    limit?: number
    sourceType?: EmbeddingSourceType | "any"
  }): Promise<EmbeddingQueueRow[]> {
    const limit = Math.max(1, params?.limit ?? 50)
    const sourceType = params?.sourceType ?? "any"
    let query = this.supabase
      .from(this.tableName)
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit)

    if (sourceType !== "any") {
      query = query.eq("source_type", sourceType)
    }

    const { data, error } = await query
    if (error) {
      this.handleError(error, "fetchPending")
      return []
    }

    return (data || []) as EmbeddingQueueRow[]
  }

  private async markProcessingFallback(rows: EmbeddingQueueRow[], leaseSeconds: number): Promise<boolean> {
    if (!rows.length) return true

    const now = new Date()
    const nowIso = now.toISOString()
    const leaseExpiresAt = new Date(now.getTime() + Math.max(1, leaseSeconds) * 1000).toISOString()

    const results = await Promise.allSettled(
      rows.map((row) =>
        this.supabase
          .from(this.tableName)
          .update({
            status: "processing",
            processing_started_at: nowIso,
            processing_lease_expires_at: leaseExpiresAt,
            attempt_count: (row.attempt_count ?? 0) + 1,
            last_error: null,
            updated_at: nowIso,
          } as EmbeddingQueueUpdate)
          .eq("id", row.id)
          .eq("status", "pending")
      )
    )

    return results.every((result) => result.status === "fulfilled" && !result.value.error)
  }

  async claimPending(params?: {
    limit?: number
    leaseSeconds?: number
    sourceType?: EmbeddingSourceType | "any"
    allowFallback?: boolean
  }): Promise<EmbeddingQueueRow[]> {
    const limit = Math.max(1, params?.limit ?? 50)
    const leaseSeconds = Math.max(1, params?.leaseSeconds ?? 180)
    const sourceType = params?.sourceType ?? "any"
    const allowFallback = params?.allowFallback ?? true

    const { data, error } = await (this.supabase.rpc as any)("claim_embedding_queue", {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
      p_source_type: sourceType === "any" ? null : sourceType,
    })

    if (error) {
      this.handleError(error, "claimPending")
      if (!allowFallback) return []

      const pending = await this.fetchPending({ limit, sourceType })
      if (!pending.length) return []

      const claimed = await this.markProcessingFallback(pending, leaseSeconds)
      return claimed ? pending : []
    }

    return (data as EmbeddingQueueRow[]) || []
  }

  async requeueExpired(limit = 500, errorMessage?: string): Promise<number> {
    const boundedLimit = Math.max(1, limit)
    const { data, error } = await (this.supabase.rpc as any)("requeue_expired_embedding_queue", {
      p_limit: boundedLimit,
      p_error: errorMessage ?? null,
    })

    if (!error) {
      return Number(data || 0)
    }

    this.handleError(error, "requeueExpired")

    const nowIso = new Date().toISOString()
    const { data: expiredRows, error: fetchError } = await this.supabase
      .from(this.tableName)
      .select("id")
      .eq("status", "processing")
      .lte("processing_lease_expires_at", nowIso)
      .order("processing_lease_expires_at", { ascending: true })
      .limit(boundedLimit)

    if (fetchError) {
      this.handleError(fetchError, "requeueExpired.fetchFallback")
      return 0
    }

    const ids = (expiredRows || []).map((row) => row.id)
    if (!ids.length) return 0

    const { error: updateError } = await this.supabase
      .from(this.tableName)
      .update({
        status: "pending",
        processing_started_at: null,
        processing_lease_expires_at: null,
        last_error: errorMessage ?? null,
        updated_at: nowIso,
      } as EmbeddingQueueUpdate)
      .in("id", ids)

    if (updateError) {
      this.handleError(updateError, "requeueExpired.updateFallback")
      return 0
    }

    return ids.length
  }

  async markCompleted(rowId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "completed",
        processing_started_at: null,
        processing_lease_expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      } as EmbeddingQueueUpdate)
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markCompleted")
      return false
    }

    return true
  }

  async markFailed(rowId: string, errorMessage: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "failed",
        processing_started_at: null,
        processing_lease_expires_at: null,
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      } as EmbeddingQueueUpdate)
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markFailed")
      return false
    }

    return true
  }

  async upsertRecipeEmbedding(params: {
    recipeId: string
    inputText: string
    embedding: number[]
    model: string
  }): Promise<boolean> {
    const payload: RecipeEmbeddingInsert = {
      recipe_id: params.recipeId,
      input_text: params.inputText,
      embedding: params.embedding,
      model: params.model,
      updated_at: new Date().toISOString(),
    }

    const { error } = await this.supabase
      .from("recipe_embeddings")
      .upsert(payload, { onConflict: "recipe_id" })

    if (error) {
      this.handleError(error, "upsertRecipeEmbedding")
      return false
    }

    return true
  }

  async upsertIngredientEmbedding(params: {
    standardizedIngredientId: string
    inputText: string
    embedding: number[]
    model: string
  }): Promise<boolean> {
    const payload: IngredientEmbeddingInsert = {
      standardized_ingredient_id: params.standardizedIngredientId,
      input_text: params.inputText,
      embedding: params.embedding,
      model: params.model,
      updated_at: new Date().toISOString(),
    }

    const { error } = await this.supabase
      .from("ingredient_embeddings")
      .upsert(payload, { onConflict: "standardized_ingredient_id" })

    if (error) {
      this.handleError(error, "upsertIngredientEmbedding")
      return false
    }

    return true
  }

  async enqueueSource(params: {
    sourceType: EmbeddingSourceType
    sourceId: string
    inputText: string
    model: string
  }): Promise<EmbeddingQueueEnqueueResult> {
    const nowIso = new Date().toISOString()

    const { data: existingRows, error: findError } = await this.supabase
      .from(this.tableName)
      .select("id")
      .eq("source_type", params.sourceType)
      .eq("source_id", params.sourceId)
      .limit(1)

    if (findError) {
      this.handleError(findError, "enqueueSource.findExisting")
      return "failed"
    }

    if ((existingRows || []).length > 0) {
      const { error: updateError } = await this.supabase
        .from(this.tableName)
        .update({
          input_text: params.inputText,
          model: params.model,
          status: "pending",
          processing_started_at: null,
          processing_lease_expires_at: null,
          last_error: null,
          updated_at: nowIso,
        } as EmbeddingQueueUpdate)
        .eq("source_type", params.sourceType)
        .eq("source_id", params.sourceId)

      if (updateError) {
        this.handleError(updateError, "enqueueSource.updateExisting")
        return "failed"
      }

      return "updated"
    }

    const payload: EmbeddingQueueInsert = {
      source_type: params.sourceType,
      source_id: params.sourceId,
      input_text: params.inputText,
      status: "pending",
      model: params.model,
    }

    const { error: insertError } = await this.supabase
      .from(this.tableName)
      .insert(payload)

    if (insertError) {
      if ((insertError as { code?: string })?.code === "23505") {
        const { error: retryUpdateError } = await this.supabase
          .from(this.tableName)
          .update({
            input_text: params.inputText,
            model: params.model,
            status: "pending",
            processing_started_at: null,
            processing_lease_expires_at: null,
            last_error: null,
            updated_at: nowIso,
          } as EmbeddingQueueUpdate)
          .eq("source_type", params.sourceType)
          .eq("source_id", params.sourceId)

        if (!retryUpdateError) return "updated"
        this.handleError(retryUpdateError, "enqueueSource.retryUpdateAfterConflict")
      }

      this.handleError(insertError, "enqueueSource.insert")
      return "failed"
    }

    return "inserted"
  }

  async upsertCandidateEmbedding(params: {
    canonicalName: string
    inputText: string
    embedding: number[]
    model: string
  }): Promise<boolean> {
    const nowIso = new Date().toISOString()

    const { error } = await this.supabase
      .from("canonical_candidate_embeddings")
      .upsert(
        {
          canonical_name: params.canonicalName,
          input_text: params.inputText,
          embedding: params.embedding,
          embedding_model: params.model,
          updated_at: nowIso,
        },
        { onConflict: "canonical_name" }
      )

    if (error) {
      this.handleError(error, "upsertCandidateEmbedding")
      return false
    }

    return true
  }

  async fetchCandidateEmbeddingsByInputTexts(
    inputTexts: string[],
    model: string
  ): Promise<Map<string, number[]>> {
    if (!inputTexts.length) return new Map()

    const { data, error } = await this.supabase
      .from("canonical_candidate_embeddings")
      .select("canonical_name, embedding")
      .in("canonical_name", inputTexts)
      .eq("embedding_model", model)

    if (error) {
      this.handleError(error, "fetchCandidateEmbeddingsByInputTexts")
      return new Map()
    }

    return new Map(
      (data || []).map((row) => [row.canonical_name, row.embedding as number[]])
    )
  }
}

export const embeddingQueueDB = EmbeddingQueueTable.getInstance()
