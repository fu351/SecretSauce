import type { IngredientStandardizationResult } from "../../backend/workers/standardizer-worker"
import type { VectorMatchCandidate } from "../../backend/workers/ingredient-worker/scoring/vector-match"
import type { IngredientMatchQueueRow } from "../database/ingredient-match-queue-db"

export type IngredientResolutionPhase =
  | "non_food_short_circuit"
  | "sqlite_cache_hit"
  | "sqlite_cache_miss"
  | "likely_non_food_vector_skip"
  | "vector_auto_resolve"
  | "vector_hint_llm"
  | "llm_no_hints"
  | "post_llm_double_check"
  | "post_llm_form_retention"
  | "post_llm_variety_retention"
  | "post_llm_retail_strip"
  | "post_llm_semantic_dedup"
  | "non_food_post_processing"
  | "failed"
  | "probation"

export type IngredientResolutionDecision =
  | "resolved_non_food_skip"
  | "resolved_from_cache"
  | "resolved_vector_auto"
  | "resolved_llm"
  | "resolved_llm_double_check_overrode"
  | "resolved_llm_form_overrode"
  | "resolved_llm_variety_overrode"
  | "resolved_non_food_post_processing"
  | "failed"
  | "probation"

export interface IngredientResolutionCandidateEntry {
  canonical_id?: string | null
  canonical_name: string
  source: "vector_fast_path" | "vector_hint" | "semantic_dedup"
  rank?: number | null
  selected?: boolean
  scores?: Record<string, number | null>
  features?: Record<string, boolean | number | string | null>
}

export interface IngredientResolutionEvent {
  event_id: string
  run_id: string
  resolver: string
  queue_row_id: string
  product_mapping_id: string | null
  recipe_ingredient_id: string | null
  raw_name: string
  cleaned_name: string
  source_search_term: string | null
  input_key: string | null
  context: string
  source: string
  phases_reached: IngredientResolutionPhase[]
  winning_phase: IngredientResolutionPhase | null
  decision: IngredientResolutionDecision | null
  final_canonical_name: string | null
  final_canonical_id: string | null
  is_food_item: boolean | null
  raw_confidence: number | null
  calibrated_confidence: number | null
  calibrator_samples: number | null
  cache_checked: boolean
  cache_hit: boolean
  vector_top_score: number | null
  vector_top_canonical: string | null
  vector_candidate_count: number | null
  vector_embedding_model: string | null
  llm_called: boolean
  llm_context: string | null
  llm_latency_ms: number | null
  llm_output_canonical: string | null
  llm_output_confidence: number | null
  llm_canonical_was_in_hint_pool: boolean | null
  llm_canonical_was_in_vector_pool: boolean | null
  double_check_changed: boolean
  double_check_original: string | null
  double_check_remapped: string | null
  form_retention_overrode: boolean
  form_retention_reason: string | null
  variety_retention_overrode: boolean
  variety_retention_reason: string | null
  retail_tokens_stripped: boolean
  retail_strip_before: string | null
  retail_strip_after: string | null
  semantic_dedup_changed: boolean
  semantic_dedup_original: string | null
  semantic_dedup_remapped: string | null
  failure_reason: string | null
  candidates: IngredientResolutionCandidateEntry[]
  total_latency_ms: number
  created_at: string
}

type MutableEvent = Omit<IngredientResolutionEvent, "total_latency_ms" | "created_at">

interface InputTrace {
  rowIds: Set<string>
  candidates: IngredientResolutionCandidateEntry[]
  hintCanonicals: Set<string>
  vectorCanonicals: Set<string>
  sourceDecision: IngredientResolutionDecision | null
  llmCalled: boolean
  llmLatencyMs: number | null
  llmContext: string | null
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function normalizeForCompare(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function vectorCandidateToEntry(
  candidate: VectorMatchCandidate,
  source: IngredientResolutionCandidateEntry["source"],
  rank?: number,
  selected = false
): IngredientResolutionCandidateEntry {
  return {
    canonical_id: candidate.matchedId,
    canonical_name: candidate.matchedName,
    source,
    rank,
    selected,
    scores: {
      cosine: candidate.cosine,
      final: candidate.finalScore,
      head_bonus: candidate.headBonus,
      lexical_bonus: candidate.lexicalBonus,
      category_penalty: candidate.categoryPenalty,
      form_penalty: candidate.formPenalty,
    },
    features: {
      category: candidate.matchedCategory,
      embedding_model: candidate.embeddingModel,
    },
  }
}

export class IngredientResolutionTelemetry {
  private readonly startedAt = Date.now()
  private readonly eventsByRowId = new Map<string, MutableEvent>()
  private readonly inputByKey = new Map<string, InputTrace>()

  constructor(params: {
    rows: IngredientMatchQueueRow[]
    runId: string
    resolver: string
  }) {
    for (const row of params.rows) {
      this.eventsByRowId.set(row.id, {
        event_id: randomId(),
        run_id: params.runId,
        resolver: params.resolver,
        queue_row_id: row.id,
        product_mapping_id: row.product_mapping_id ?? null,
        recipe_ingredient_id: row.recipe_ingredient_id ?? null,
        raw_name: row.raw_product_name || "",
        cleaned_name: row.cleaned_name || "",
        source_search_term: null,
        input_key: null,
        context: row.source,
        source: row.source,
        phases_reached: [],
        winning_phase: null,
        decision: null,
        final_canonical_name: null,
        final_canonical_id: null,
        is_food_item: null,
        raw_confidence: null,
        calibrated_confidence: null,
        calibrator_samples: null,
        cache_checked: false,
        cache_hit: false,
        vector_top_score: null,
        vector_top_canonical: null,
        vector_candidate_count: null,
        vector_embedding_model: null,
        llm_called: false,
        llm_context: null,
        llm_latency_ms: null,
        llm_output_canonical: null,
        llm_output_confidence: null,
        llm_canonical_was_in_hint_pool: null,
        llm_canonical_was_in_vector_pool: null,
        double_check_changed: false,
        double_check_original: null,
        double_check_remapped: null,
        form_retention_overrode: false,
        form_retention_reason: null,
        variety_retention_overrode: false,
        variety_retention_reason: null,
        retail_tokens_stripped: false,
        retail_strip_before: null,
        retail_strip_after: null,
        semantic_dedup_changed: false,
        semantic_dedup_original: null,
        semantic_dedup_remapped: null,
        failure_reason: null,
        candidates: [],
      })
    }
  }

  recordInput(rowId: string, inputKey: string, searchTerm: string, context: string): void {
    const event = this.eventsByRowId.get(rowId)
    if (event) {
      event.source_search_term = searchTerm
      event.input_key = inputKey
      event.context = context
    }

    const trace = this.inputByKey.get(inputKey) ?? {
      rowIds: new Set<string>(),
      candidates: [],
      hintCanonicals: new Set<string>(),
      vectorCanonicals: new Set<string>(),
      sourceDecision: null,
      llmCalled: false,
      llmLatencyMs: null,
      llmContext: null,
    }
    trace.rowIds.add(rowId)
    this.inputByKey.set(inputKey, trace)
  }

  recordCache(inputKey: string, hit: boolean, canonicalName?: string | null): void {
    const trace = this.inputByKey.get(inputKey)
    if (hit && trace) {
      trace.sourceDecision = "resolved_from_cache"
    }
    this.forInputRows(inputKey, (event) => {
      event.cache_checked = true
      event.cache_hit = hit
      this.addPhase(event, hit ? "sqlite_cache_hit" : "sqlite_cache_miss")
      if (hit && canonicalName) {
        event.final_canonical_name = canonicalName
      }
    })
  }

  recordLikelyNonFoodVectorSkip(inputKey: string): void {
    this.forInputRows(inputKey, (event) => this.addPhase(event, "likely_non_food_vector_skip"))
  }

  recordVectorFastPath(inputKey: string, candidate: VectorMatchCandidate): void {
    const trace = this.inputByKey.get(inputKey)
    const entry = vectorCandidateToEntry(candidate, "vector_fast_path", 0, true)
    if (trace) {
      trace.sourceDecision = "resolved_vector_auto"
      trace.candidates.push(entry)
      trace.vectorCanonicals.add(normalizeForCompare(candidate.matchedName))
    }
    this.forInputRows(inputKey, (event) => {
      event.vector_top_score = candidate.finalScore
      event.vector_top_canonical = candidate.matchedName
      event.vector_candidate_count = 1
      event.vector_embedding_model = candidate.embeddingModel
      event.candidates.push(entry)
      this.addPhase(event, "vector_auto_resolve")
    })
  }

  recordVectorHints(inputKey: string, candidates: VectorMatchCandidate[], embeddingModel: string): void {
    const trace = this.inputByKey.get(inputKey)
    const entries = candidates.map((candidate, index) =>
      vectorCandidateToEntry(candidate, "vector_hint", index, false)
    )
    if (trace) {
      trace.candidates.push(...entries)
      for (const candidate of candidates) {
        trace.hintCanonicals.add(normalizeForCompare(candidate.matchedName))
        trace.vectorCanonicals.add(normalizeForCompare(candidate.matchedName))
      }
    }
    this.forInputRows(inputKey, (event) => {
      event.vector_candidate_count = candidates.length
      event.vector_embedding_model = embeddingModel
      event.candidates.push(...entries)
      if (candidates[0]) {
        event.vector_top_score = candidates[0].finalScore
        event.vector_top_canonical = candidates[0].matchedName
      }
      this.addPhase(event, candidates.length > 0 ? "vector_hint_llm" : "llm_no_hints")
    })
  }

  recordLLMBatch(inputKeys: string[], context: string, latencyMs: number): void {
    for (const inputKey of inputKeys) {
      const trace = this.inputByKey.get(inputKey)
      if (trace) {
        trace.llmCalled = true
        trace.llmLatencyMs = latencyMs
        trace.llmContext = context
      }
      this.forInputRows(inputKey, (event) => {
        event.llm_called = true
        event.llm_context = context
        event.llm_latency_ms = latencyMs
      })
    }
  }

  recordLLMResult(inputKey: string, result: IngredientStandardizationResult): void {
    const trace = this.inputByKey.get(inputKey)
    if (trace) {
      trace.sourceDecision = "resolved_llm"
    }
    const canonical = normalizeForCompare(result.canonicalName)
    this.forInputRows(inputKey, (event) => {
      event.llm_output_canonical = result.canonicalName ?? null
      event.llm_output_confidence = result.confidence ?? null
      event.llm_canonical_was_in_hint_pool = trace ? trace.hintCanonicals.has(canonical) : null
      event.llm_canonical_was_in_vector_pool = trace ? trace.vectorCanonicals.has(canonical) : null
    })
  }

  recordNonFoodShortCircuit(rowId: string, canonicalName: string): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "non_food_short_circuit")
    event.decision = "resolved_non_food_skip"
    event.final_canonical_name = canonicalName
    event.final_canonical_id = null
    event.is_food_item = false
    event.raw_confidence = 0
    event.calibrated_confidence = 0
  }

  recordTitleNonFoodOverride(rowId: string, canonicalName: string): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "non_food_post_processing")
    event.final_canonical_name = canonicalName
    event.is_food_item = false
  }

  recordFormRetention(rowId: string, original: string, retained: string, reason: string): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "post_llm_form_retention")
    event.form_retention_overrode = true
    event.form_retention_reason = reason
    event.double_check_original = event.double_check_original ?? original
    event.double_check_remapped = event.double_check_remapped ?? retained
  }

  recordVarietyRetention(rowId: string, original: string, retained: string, reason: string): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "post_llm_variety_retention")
    event.variety_retention_overrode = true
    event.variety_retention_reason = reason
    event.double_check_original = event.double_check_original ?? original
    event.double_check_remapped = event.double_check_remapped ?? retained
  }

  recordRetailStrip(rowId: string, before: string, after: string): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "post_llm_retail_strip")
    event.retail_tokens_stripped = true
    event.retail_strip_before = before
    event.retail_strip_after = after
  }

  recordCalibration(rowId: string, rawConfidence: number, calibratedConfidence: number, calibratorSamples: number): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    event.raw_confidence = rawConfidence
    event.calibrated_confidence = calibratedConfidence
    event.calibrator_samples = calibratorSamples
  }

  recordDoubleCheck(rowId: string, original: string, remapped: string): void {
    if (normalizeForCompare(original) === normalizeForCompare(remapped)) return
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "post_llm_double_check")
    event.double_check_changed = true
    event.double_check_original = original
    event.double_check_remapped = remapped
  }

  recordSemanticDedup(rowId: string, original: string, remapped: string, candidate: VectorMatchCandidate): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, "post_llm_semantic_dedup")
    event.semantic_dedup_changed = true
    event.semantic_dedup_original = original
    event.semantic_dedup_remapped = remapped
    event.candidates.push(vectorCandidateToEntry(candidate, "semantic_dedup", 0, true))
  }

  recordResolved(rowId: string, params: {
    canonicalName: string
    canonicalId?: string | null
    isFoodItem: boolean | null
    confidence: number
  }): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    event.final_canonical_name = params.canonicalName
    event.final_canonical_id = params.canonicalId ?? null
    event.is_food_item = params.isFoodItem
    event.raw_confidence = event.raw_confidence ?? params.confidence
    event.calibrated_confidence = event.calibrated_confidence ?? params.confidence

    if (event.is_food_item === false && event.phases_reached.includes("non_food_post_processing")) {
      event.decision = "resolved_non_food_post_processing"
    } else if (event.double_check_changed) {
      event.decision = "resolved_llm_double_check_overrode"
    } else if (event.form_retention_overrode) {
      event.decision = "resolved_llm_form_overrode"
    } else if (event.variety_retention_overrode) {
      event.decision = "resolved_llm_variety_overrode"
    } else if (!event.decision) {
      event.decision = this.sourceDecisionForRow(rowId) ?? "resolved_llm"
    }
  }

  recordFailed(rowId: string, error: string, probation = false): void {
    const event = this.eventsByRowId.get(rowId)
    if (!event) return
    this.addPhase(event, probation ? "probation" : "failed")
    event.decision = probation ? "probation" : "failed"
    event.failure_reason = error
  }

  completeEvents(): IngredientResolutionEvent[] {
    const createdAt = new Date().toISOString()
    const totalLatencyMs = Date.now() - this.startedAt
    return Array.from(this.eventsByRowId.values()).map((event) => ({
      ...event,
      winning_phase: event.phases_reached.at(-1) ?? null,
      total_latency_ms: totalLatencyMs,
      created_at: createdAt,
    }))
  }

  private sourceDecisionForRow(rowId: string): IngredientResolutionDecision | null {
    for (const trace of this.inputByKey.values()) {
      if (trace.rowIds.has(rowId)) return trace.sourceDecision
    }
    return null
  }

  private forInputRows(inputKey: string, fn: (event: MutableEvent) => void): void {
    const trace = this.inputByKey.get(inputKey)
    if (!trace) return
    for (const rowId of trace.rowIds) {
      const event = this.eventsByRowId.get(rowId)
      if (event) fn(event)
    }
  }

  private addPhase(event: MutableEvent, phase: IngredientResolutionPhase): void {
    event.phases_reached.push(phase)
  }
}

export function summarizeIngredientResolutionEvents(events: IngredientResolutionEvent[]) {
  const llmInputKeys = new Set<string>()
  const llmHintHitInputKeys = new Set<string>()
  const summary = {
    itemsClaimed: events.length,
    itemsResolved: 0,
    itemsFailed: 0,
    itemsProbation: 0,
    resolvedNonFoodSkip: 0,
    resolvedFromCache: 0,
    resolvedVectorAuto: 0,
    resolvedLlm: 0,
    resolvedLlmDoubleCheckOverrode: 0,
    resolvedLlmFormOverrode: 0,
    resolvedLlmVarietyOverrode: 0,
    resolvedNonFoodPostProcessing: 0,
    llmCallsTotal: 0,
    llmHintPoolHits: 0,
    llmHintPoolMisses: 0,
    doubleCheckRemaps: 0,
    formRetentionOverrides: 0,
    varietyRetentionOverrides: 0,
    semanticDedupRemaps: 0,
  }

  for (const event of events) {
    if (event.decision?.startsWith("resolved")) summary.itemsResolved += 1
    if (event.decision === "failed") summary.itemsFailed += 1
    if (event.decision === "probation") summary.itemsProbation += 1
    if (event.decision === "resolved_non_food_skip") summary.resolvedNonFoodSkip += 1
    if (event.decision === "resolved_from_cache") summary.resolvedFromCache += 1
    if (event.decision === "resolved_vector_auto") summary.resolvedVectorAuto += 1
    if (event.decision === "resolved_llm") summary.resolvedLlm += 1
    if (event.decision === "resolved_llm_double_check_overrode") summary.resolvedLlmDoubleCheckOverrode += 1
    if (event.decision === "resolved_llm_form_overrode") summary.resolvedLlmFormOverrode += 1
    if (event.decision === "resolved_llm_variety_overrode") summary.resolvedLlmVarietyOverrode += 1
    if (event.decision === "resolved_non_food_post_processing") summary.resolvedNonFoodPostProcessing += 1
    if (event.llm_called) {
      const llmKey = event.input_key ?? event.queue_row_id
      llmInputKeys.add(llmKey)
      if (event.llm_canonical_was_in_hint_pool) llmHintHitInputKeys.add(llmKey)
    }
    if (event.double_check_changed) summary.doubleCheckRemaps += 1
    if (event.form_retention_overrode) summary.formRetentionOverrides += 1
    if (event.variety_retention_overrode) summary.varietyRetentionOverrides += 1
    if (event.semantic_dedup_changed) summary.semanticDedupRemaps += 1
  }

  summary.llmCallsTotal = llmInputKeys.size
  summary.llmHintPoolHits = llmHintHitInputKeys.size
  summary.llmHintPoolMisses = Math.max(0, summary.llmCallsTotal - summary.llmHintPoolHits)

  return summary
}
