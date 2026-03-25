import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

export type IngredientMatchQueueStatus = "pending" | "processing" | "resolved" | "failed" | "probation"
export type IngredientMatchQueueReviewMode = "ingredient" | "unit" | "any"
export type IngredientMatchQueueSource = "scraper" | "recipe"
export type IngredientMatchQueueRow = Database["public"]["Tables"]["ingredient_match_queue"]["Row"]
export type IngredientMatchQueueInsert = Database["public"]["Tables"]["ingredient_match_queue"]["Insert"]
export type IngredientMatchQueueUpdate = Database["public"]["Tables"]["ingredient_match_queue"]["Update"]
export type CanonicalDoubleCheckDecision = "remapped" | "skipped"
export type CanonicalDoubleCheckDirection = "generic_to_specific" | "specific_to_generic" | "lateral" | "unknown"
export type IngredientConfidenceOutcome = "accepted" | "rejected"
export interface CanonicalDoubleCheckDailyStatsRow {
  event_date: string
  source_canonical: string
  target_canonical: string
  decision: CanonicalDoubleCheckDecision
  reason: string
  direction: CanonicalDoubleCheckDirection
  event_count: number
  source_category: string | null
  target_category: string | null
  min_confidence: number | null
  max_confidence: number | null
  min_similarity: number | null
  max_similarity: number | null
}
export interface CanonicalCreationProbationStats {
  distinctSources: number
  totalEvents: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}
export interface CanonicalTokenIdfRow {
  document_count: number
  token: string
  doc_freq: number
}

export interface SensitivityPairStatsRow {
  source_canonical: string
  target_canonical: string
  total_events: number
}

export interface IngredientConfidenceCalibrationBinRow {
  bin_start: number
  sample_count: number
  accepted_count: number
  acceptance_rate: number
}

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
    isFoodItem?: boolean | null
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
      isFoodItem,
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

    if (isFoodItem !== undefined) {
      payload.is_food_item = isFoodItem
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

  async markProbation(rowId: string, resolver?: string, errorMessage?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: "probation",
        resolved_by: resolver ?? null,
        resolved_at: new Date().toISOString(),
        processing_started_at: null,
        processing_lease_expires_at: null,
        last_error: errorMessage ?? null,
      })
      .eq("id", rowId)

    if (error) {
      this.handleError(error, "markProbation")
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
        is_food_item: true,
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

  async logCanonicalDoubleCheckDaily(params: {
    sourceCanonical: string
    targetCanonical: string
    decision: CanonicalDoubleCheckDecision
    reason?: string
    direction?: CanonicalDoubleCheckDirection
    aiConfidence?: number | null
    similarity?: number | null
    sourceCategory?: string | null
    targetCategory?: string | null
    eventAt?: string | null
  }): Promise<boolean> {
    const {
      sourceCanonical,
      targetCanonical,
      decision,
      reason,
      direction,
      aiConfidence,
      similarity,
      sourceCategory,
      targetCategory,
      eventAt,
    } = params

    const { error } = await (this.supabase.rpc as any)("fn_log_canonical_double_check_daily", {
      p_source_canonical: sourceCanonical,
      p_target_canonical: targetCanonical,
      p_decision: decision,
      p_reason: reason ?? "none",
      p_direction: direction ?? "unknown",
      p_ai_confidence: aiConfidence ?? null,
      p_similarity: similarity ?? null,
      p_source_category: sourceCategory ?? null,
      p_target_category: targetCategory ?? null,
      p_event_at: eventAt ?? null,
    })

    if (error) {
      this.handleError(error, "logCanonicalDoubleCheckDaily")
      return false
    }

    return true
  }

  async fetchCanonicalDoubleCheckDailyStats(params?: {
    daysBack?: number
    directions?: CanonicalDoubleCheckDirection[]
    decisions?: CanonicalDoubleCheckDecision[]
    minEventCount?: number
    limit?: number
  }): Promise<CanonicalDoubleCheckDailyStatsRow[]> {
    const {
      daysBack = 30,
      directions,
      decisions,
      minEventCount = 1,
      limit = 5000,
    } = params || {}

    const safeDaysBack = Math.max(1, Math.min(daysBack, 365))
    const cutoffDate = new Date(Date.now() - safeDaysBack * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    let query = (this.supabase.from as any)("canonical_double_check_daily_stats")
      .select(
        [
          "event_date",
          "source_canonical",
          "target_canonical",
          "decision",
          "reason",
          "direction",
          "event_count",
          "source_category",
          "target_category",
          "min_confidence",
          "max_confidence",
          "min_similarity",
          "max_similarity",
        ].join(",")
      )
      .gte("event_date", cutoffDate)
      .gte("event_count", Math.max(1, minEventCount))
      .order("event_date", { ascending: false })
      .order("event_count", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 20000)))

    if (directions?.length) {
      query = query.in("direction", directions)
    }

    if (decisions?.length) {
      query = query.in("decision", decisions)
    }

    const { data, error } = await query
    if (error) {
      this.handleError(error, "fetchCanonicalDoubleCheckDailyStats")
      return []
    }

    return ((data || []) as CanonicalDoubleCheckDailyStatsRow[]).map((row) => ({
      ...row,
      event_count: Number(row.event_count || 0),
    }))
  }

  async trackCanonicalCreationProbation(params: {
    canonicalName: string
    sourceSignature: string
    source?: string | null
    eventAt?: string | null
  }): Promise<CanonicalCreationProbationStats | null> {
    const { canonicalName, sourceSignature, source, eventAt } = params

    const { data, error } = await (this.supabase.rpc as any)("fn_track_canonical_creation_probation", {
      p_canonical_name: canonicalName,
      p_source_signature: sourceSignature,
      p_source: source ?? null,
      p_event_at: eventAt ?? null,
    })

    if (error) {
      this.handleError(error, "trackCanonicalCreationProbation")
      return null
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
        distinct_sources?: number
        total_events?: number
        first_seen_at?: string | null
        last_seen_at?: string | null
      }
      | undefined

    return {
      distinctSources: Number(row?.distinct_sources ?? 0),
      totalEvents: Number(row?.total_events ?? 0),
      firstSeenAt: row?.first_seen_at ?? null,
      lastSeenAt: row?.last_seen_at ?? null,
    }
  }

  async logIngredientConfidenceOutcome(params: {
    rawConfidence: number
    calibratedConfidence?: number | null
    outcome: IngredientConfidenceOutcome
    reason?: string
    category?: string | null
    canonicalName?: string | null
    tokenCount?: number | null
    isNewCanonical?: boolean
    source?: string | null
    resolver?: string | null
    context?: string | null
    metadata?: Record<string, unknown> | null
    recordedAt?: string | null
  }): Promise<boolean> {
    const {
      rawConfidence,
      calibratedConfidence,
      outcome,
      reason,
      category,
      canonicalName,
      tokenCount,
      isNewCanonical,
      source,
      resolver,
      context,
      metadata,
      recordedAt,
    } = params

    const { error } = await (this.supabase.rpc as any)("fn_log_ingredient_confidence_outcome", {
      p_raw_confidence: rawConfidence,
      p_calibrated_confidence: calibratedConfidence ?? null,
      p_outcome: outcome,
      p_reason: reason ?? "none",
      p_category: category ?? null,
      p_canonical_name: canonicalName ?? null,
      p_token_count: tokenCount ?? null,
      p_is_new_canonical: isNewCanonical ?? false,
      p_source: source ?? null,
      p_resolver: resolver ?? null,
      p_context: context ?? null,
      p_metadata: metadata ?? {},
      p_recorded_at: recordedAt ?? null,
    })

    if (error) {
      this.handleError(error, "logIngredientConfidenceOutcome")
      return false
    }

    return true
  }

  async fetchIngredientConfidenceCalibration(params?: {
    daysBack?: number
    binSize?: number
    minSamples?: number
  }): Promise<IngredientConfidenceCalibrationBinRow[]> {
    const { daysBack = 30, binSize = 0.1, minSamples = 10 } = params || {}

    const { data, error } = await (this.supabase.rpc as any)("fn_get_ingredient_confidence_calibration", {
      p_days_back: Math.max(1, Math.min(daysBack, 365)),
      p_bin_size: Math.max(0.01, Math.min(binSize, 0.5)),
      p_min_samples: Math.max(1, minSamples),
    })

    if (error) {
      this.handleError(error, "fetchIngredientConfidenceCalibration")
      return []
    }

    return ((data || []) as IngredientConfidenceCalibrationBinRow[]).map((row) => ({
      bin_start: Number(row.bin_start ?? 0),
      sample_count: Number(row.sample_count ?? 0),
      accepted_count: Number(row.accepted_count ?? 0),
      acceptance_rate: Number(row.acceptance_rate ?? 0),
    }))
  }

  async fetchCanonicalTokenIdf(): Promise<CanonicalTokenIdfRow[]> {
    const { data, error } = await (this.supabase.rpc as any)("fn_get_canonical_token_idf")

    if (error) {
      this.handleError(error, "fetchCanonicalTokenIdf")
      return []
    }

    return ((data || []) as CanonicalTokenIdfRow[]).map((row) => ({
      document_count: Number(row.document_count ?? 0),
      token: String(row.token ?? ""),
      doc_freq: Number(row.doc_freq ?? 0),
    }))
  }

  async fetchSensitivityPairStats(params?: {
    minEventCount?: number
    daysBack?: number
  }): Promise<SensitivityPairStatsRow[]> {
    const { minEventCount = 1, daysBack = 90 } = params || {}
    const { data, error } = await (this.supabase.rpc as any)("fn_get_sensitivity_pair_stats", {
      p_days_back: daysBack,
      p_min_event_count: Math.max(1, minEventCount),
    })

    if (error) {
      this.handleError(error, "fetchSensitivityPairStats")
      return []
    }

    return ((data || []) as SensitivityPairStatsRow[]).map((row) => ({
      source_canonical: String(row.source_canonical ?? ""),
      target_canonical: String(row.target_canonical ?? ""),
      total_events: Number(row.total_events ?? 0),
    }))
  }

  async fetchKnownNonFoodProductMappingIds(productMappingIds: string[]): Promise<Set<string>> {
    if (!productMappingIds.length) return new Set()

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("product_mapping_id")
      .in("product_mapping_id", productMappingIds)
      .eq("is_food_item", false)
      .eq("status", "resolved")

    if (error) {
      this.handleError(error, "fetchKnownNonFoodProductMappingIds")
      return new Set()
    }

    return new Set(
      (data || []).map((row) => row.product_mapping_id).filter(Boolean) as string[]
    )
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
