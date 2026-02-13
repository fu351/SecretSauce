import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

export type IngredientMatchQueueStatus = "pending" | "processing" | "resolved" | "failed"
export type IngredientMatchQueueReviewMode = "ingredient" | "unit" | "any"
export type IngredientMatchQueueSource = "scraper" | "recipe"
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

  private matchesReviewMode(row: IngredientMatchQueueRow, reviewMode: IngredientMatchQueueReviewMode): boolean {
    if (reviewMode === "any") return true
    if (reviewMode === "ingredient") return row.needs_ingredient_review !== false
    return row.needs_unit_review === true
  }

  async fetchPendingFiltered(params?: {
    limit?: number
    reviewMode?: IngredientMatchQueueReviewMode
    source?: IngredientMatchQueueSource | "any"
  }): Promise<IngredientMatchQueueRow[]> {
    const limit = Math.max(1, params?.limit ?? 25)
    const reviewMode = params?.reviewMode ?? "ingredient"
    const source = params?.source ?? "any"

    const pageSize = Math.max(limit * 2, 100)
    const maxPages = 20
    const collected: IngredientMatchQueueRow[] = []
    let offset = 0

    for (let page = 0; page < maxPages && collected.length < limit; page += 1) {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (error) {
        this.handleError(error, "fetchPendingFiltered")
        break
      }

      const rows = (data || []) as IngredientMatchQueueRow[]
      if (!rows.length) break

      for (const row of rows) {
        if (!this.matchesReviewMode(row, reviewMode)) continue
        if (source !== "any" && row.source !== source) continue
        collected.push(row)
        if (collected.length >= limit) break
      }

      if (rows.length < pageSize) break
      offset += pageSize
    }

    return collected.slice(0, limit)
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

  async claimPending(params?: {
    limit?: number
    resolver?: string
    leaseSeconds?: number
    reviewMode?: IngredientMatchQueueReviewMode
    source?: IngredientMatchQueueSource | "any"
    allowFallback?: boolean
  }): Promise<IngredientMatchQueueRow[]> {
    const limit = params?.limit ?? 25
    const resolver = params?.resolver
    const leaseSeconds = params?.leaseSeconds ?? 180
    const reviewMode = params?.reviewMode ?? "ingredient"
    const source = params?.source ?? "any"
    const allowFallback = params?.allowFallback ?? true

    // Legacy recipe rows can remain pending with ingredient review disabled.
    // Normalize flags so ingredient-mode workers can claim and standardize them.
    if (reviewMode === "ingredient" && (source === "recipe" || source === "any")) {
      await this.backfillRecipeIngredientReviewFlags()
    }

    const { data, error } = await (this.supabase.rpc as any)("claim_ingredient_match_queue", {
      p_limit: limit,
      p_resolver: resolver ?? null,
      p_lease_seconds: leaseSeconds,
      p_review_mode: reviewMode,
      p_source: source === "any" ? null : source,
    })

    if (error) {
      this.handleError(error, "claimPending")
      if (!allowFallback) return []

      // Legacy fallback for environments that have not yet applied the claim RPC migration.
      const pending = await this.fetchPendingFiltered({ limit, reviewMode, source })
      if (!pending.length) return []

      const claimed = await this.markProcessing(
        pending.map((row) => row.id),
        resolver,
        { leaseSeconds }
      )

      return claimed ? pending : []
    }

    return (data as IngredientMatchQueueRow[]) || []
  }

  async backfillRecipeIngredientReviewFlags(): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        needs_ingredient_review: true,
      } as IngredientMatchQueueUpdate)
      .eq("status", "pending")
      .eq("source", "recipe")
      .is("resolved_ingredient_id", null)
      .eq("needs_ingredient_review", false)
      .select("id")

    if (error) {
      this.handleError(error, "backfillRecipeIngredientReviewFlags")
      return 0
    }

    return (data || []).length
  }

  async markProcessing(
    rowIds: string[],
    resolver?: string,
    options?: { leaseSeconds?: number }
  ): Promise<boolean> {
    if (!rowIds.length) return true

    const now = new Date()
    const leaseSeconds = options?.leaseSeconds

    const payload: Record<string, any> = {
      status: "processing",
      resolved_by: resolver ?? null,
      resolved_at: null,
      processing_started_at: now.toISOString(),
      last_error: null,
    }

    if (leaseSeconds && leaseSeconds > 0) {
      payload.processing_lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    }

    const { error } = await this.supabase
      .from(this.tableName)
      .update(payload as IngredientMatchQueueUpdate)
      .in("id", rowIds)

    if (error) {
      this.handleError(error, "markProcessing")
      return false
    }

    return true
  }

  async markResolved(params: {
    rowId: string
    resolvedIngredientId?: string | null
    canonicalName: string
    confidence: number
    resolver?: string
    bestFuzzyMatch?: string
    resolvedUnit?: Database["public"]["Enums"]["unit_label"] | null
    resolvedQuantity?: number | null
    unitConfidence?: number | null
    quantityConfidence?: number | null
    clearIngredientReviewFlag?: boolean
    clearUnitReviewFlag?: boolean
  }): Promise<boolean> {
    const {
      rowId,
      resolvedIngredientId,
      canonicalName,
      confidence,
      resolver,
      bestFuzzyMatch,
      resolvedUnit,
      resolvedQuantity,
      unitConfidence,
      quantityConfidence,
      clearIngredientReviewFlag = true,
      clearUnitReviewFlag = true,
    } = params

    const payload: Record<string, any> = {
      status: "resolved",
      resolved_by: resolver ?? null,
      resolved_at: new Date().toISOString(),
      best_fuzzy_match: bestFuzzyMatch ?? canonicalName,
      fuzzy_score: confidence,
      processing_started_at: null,
      processing_lease_expires_at: null,
      last_error: null,
    }

    if (resolvedIngredientId !== undefined) {
      payload.resolved_ingredient_id = resolvedIngredientId
    }

    if (resolvedUnit !== undefined) {
      payload.resolved_unit = resolvedUnit
    }

    if (resolvedQuantity !== undefined) {
      payload.resolved_quantity = resolvedQuantity
    }

    if (unitConfidence !== undefined) {
      payload.unit_confidence = unitConfidence
    }

    if (quantityConfidence !== undefined) {
      payload.quantity_confidence = quantityConfidence
    }

    if (clearIngredientReviewFlag) {
      payload.needs_ingredient_review = false
    }

    if (clearUnitReviewFlag) {
      payload.needs_unit_review = false
    }

    const { error } = await this.supabase
      .from(this.tableName)
      .update(payload as IngredientMatchQueueUpdate)
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markResolved")
      return false
    }

    return true
  }

  async markFailed(rowId: string, resolver?: string, errorMessage?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "failed",
        resolved_by: resolver ?? null,
        resolved_at: new Date().toISOString(),
        processing_started_at: null,
        processing_lease_expires_at: null,
        last_error: errorMessage ?? null,
      })
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markFailed")
      return false
    }

    return true
  }

  async markIngredientResolvedPendingUnit(params: {
    rowId: string
    resolvedIngredientId: string
    canonicalName: string
    confidence: number
    resolver?: string
  }): Promise<boolean> {
    const { rowId, resolvedIngredientId, canonicalName, confidence, resolver } = params

    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "pending",
        resolved_by: resolver ?? null,
        resolved_at: null,
        resolved_ingredient_id: resolvedIngredientId,
        best_fuzzy_match: canonicalName,
        fuzzy_score: confidence,
        needs_ingredient_review: false,
        needs_unit_review: true,
        processing_started_at: null,
        processing_lease_expires_at: null,
        last_error: null,
      })
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markIngredientResolvedPendingUnit")
      return false
    }

    return true
  }

  async requeueExpired(limit = 1000, errorMessage?: string): Promise<number> {
    const { data, error } = await (this.supabase.rpc as any)("requeue_expired_ingredient_match_queue", {
      p_limit: limit,
      p_error: errorMessage ?? null,
    })

    if (error) {
      this.handleError(error, "requeueExpired")
      return 0
    }

    return Number(data ?? 0)
  }
}

export const ingredientMatchQueueDB = IngredientMatchQueueTable.getInstance()
