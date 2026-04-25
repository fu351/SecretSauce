This comparison document is the most useful thing shared so far — it grounds everything in the actual code. The observability plan I wrote needs to be revised to reflect what the code actually does rather than what the abstract architecture docs describe. Here's the corrected, concrete plan.

---

# Ingredient Standardizer Observability Plan
## Revised Against Actual `processor.ts` Behavior

---

## What The Comparison Document Reveals That Changes The Plan

Three things from the code analysis need to be corrected before any instrumentation is written:

**1. The `ResolutionPhase` enum was wrong.** The previous plan included `sql_fast_match` as a phase, but no pre-LLM SQL gate exists today. The actual phases are: non-food short-circuit → SQLite cache → vector fast-path → LLM with vector hints → post-LLM corrections (double-check, form retention, variety retention, semantic dedup). The enum needs to match reality.

**2. The confidence calibrator already exists.** `getIngredientConfidenceCalibrator()` and `logIngredientConfidenceOutcome()` are already running. The observability plan must not duplicate that system — it must integrate with it and surface its output in the resolution log.

**3. Two telemetry tables already exist.** Whatever `logIngredientConfidenceOutcome()` and `logCanonicalDoubleCheckDaily()` write to is already running. The new tables need to be additive and queryable alongside those, not redundant.

---

## Corrected Phase Taxonomy

```ts
// lib/observability/resolution-phases.ts

export type ResolutionPhase =
  | 'non_food_short_circuit'   // known non-food product_mapping_id — skips everything
  | 'sqlite_cache_hit'         // localQueueAICache hit
  | 'likely_non_food_keyword'  // likelyNonFoodByKeyword() guard fired
  | 'vector_auto_resolve'      // resolveVectorMatch() score >= 0.93 → skipped LLM
  | 'vector_hint_llm'          // resolveVectorCandidates() hints injected → LLM called
  | 'llm_no_hints'             // LLM called without vector hints (low/no vector results)
  | 'post_llm_double_check'    // resolveCanonicalWithDoubleCheck() changed result
  | 'post_llm_form_retention'  // maybeRetainFormSpecificCanonical() overrode LLM
  | 'post_llm_variety_retention' // maybeRetainVarietyCanonical() overrode LLM
  | 'post_llm_semantic_dedup'  // new canonical → resolveVectorMatch() ran again
  | 'failed'
  | 'non_food_post_processing' // hasNonFoodTitleSignals() fired after resolution

export type ResolutionDecision =
  | 'resolved_non_food_skip'
  | 'resolved_from_cache'
  | 'resolved_non_food_keyword'
  | 'resolved_vector_auto'
  | 'resolved_llm'
  | 'resolved_llm_double_check_overrode'
  | 'resolved_llm_form_overrode'
  | 'resolved_llm_variety_overrode'
  | 'failed'
  | 'probation'
```

---

## Layer 1 — The `ResolutionObserver` Accumulator

This lives entirely in-process. It's built up synchronously as `processor.ts` executes and emits at the end. No async, no DB, no latency.

```ts
// lib/observability/resolution-observer.ts

export class ResolutionObserver {
  private startedAt: number
  private event: Partial<ResolutionEvent>
  private candidates: CandidateEntry[] = []

  constructor(init: {
    queueRowId: string
    productMappingId?: string
    recipeIngredientId?: string
    rawName: string
    cleanedName: string
    context: 'scraper' | 'recipe' | 'pantry'
    workerRunId: string
  }) {
    this.startedAt = Date.now()
    this.event = {
      eventId: crypto.randomUUID(),
      ...init,
      phasesReached: [],
    }
  }

  // Called when the cache is checked
  recordCacheCheck(hit: boolean, cachedCanonical?: string): void {
    this.event.cacheChecked = true
    this.event.cacheHit = hit
    if (hit) this.event.cacheCanonical = cachedCanonical
    this.addPhase('sqlite_cache_hit')
  }

  // Called after resolveVectorMatch() runs
  recordVectorResult(result: {
    topScore: number
    topCanonical: string
    candidateCount: number
    autoResolved: boolean
    embeddingModel: string
    candidates: CandidateEntry[]
  }): void {
    this.event.vectorTopScore = result.topScore
    this.event.vectorTopCanonical = result.topCanonical
    this.event.vectorCandidateCount = result.candidateCount
    this.event.vectorEmbeddingModel = result.embeddingModel
    this.candidates.push(...result.candidates)
    this.addPhase(result.autoResolved ? 'vector_auto_resolve' : 'vector_hint_llm')
  }

  // Called when the LLM is invoked
  recordLLMCall(result: {
    provider: string
    model: string
    latencyMs: number
    promptTokens: number
    completionTokens: number
    outputCanonical: string
    outputCategory: string
    outputConfidence: number
    error?: string
    hintCandidates: string[]  // the canonical names injected as hints
  }): void {
    this.event.llmCalled = true
    this.event.llmProvider = result.provider
    this.event.llmModel = result.model
    this.event.llmLatencyMs = result.latencyMs
    this.event.llmPromptTokens = result.promptTokens
    this.event.llmCompletionTokens = result.completionTokens
    this.event.llmOutputCanonical = result.outputCanonical
    this.event.llmOutputConfidence = result.outputConfidence
    this.event.llmError = result.error
    this.event.estimatedLlmCostUsd = estimateCost(
      result.provider, result.model,
      result.promptTokens, result.completionTokens
    )

    // The key analytical flag: was the LLM's answer already in the hint pool?
    this.event.llmCanonicalWasInHintPool =
      result.hintCandidates.includes(result.outputCanonical)

    // Was it in the broader vector candidate set?
    this.event.llmCanonicalWasInVectorPool =
      this.candidates.some(c => c.canonicalName === result.outputCanonical)
  }

  // Called after resolveCanonicalWithDoubleCheck()
  recordDoubleCheck(result: {
    changed: boolean
    originalCanonical: string
    remappedCanonical?: string
    similarityScore?: number
  }): void {
    this.event.doubleCheckChanged = result.changed
    this.event.doubleCheckOriginal = result.originalCanonical
    this.event.doubleCheckRemapped = result.remappedCanonical
    this.event.doubleCheckSimilarity = result.similarityScore
    if (result.changed) this.addPhase('post_llm_double_check')
  }

  // Called after form/variety retention checks
  recordRetentionOverride(type: 'form' | 'variety', original: string, retained: string): void {
    if (type === 'form') {
      this.event.formRetentionOverrode = true
      this.addPhase('post_llm_form_retention')
    } else {
      this.event.varietyRetentionOverrode = true
      this.addPhase('post_llm_variety_retention')
    }
    this.event.retentionOriginal = original
    this.event.retentionRetained = retained
  }

  // Called after stripRetailSuffixTokens
  recordRetailStripResult(stripped: boolean, before: string, after: string): void {
    this.event.retailTokensStripped = stripped
    this.event.retailStripBefore = before
    this.event.retailStripAfter = after
  }

  // Called with confidence calibrator output
  recordCalibration(result: {
    rawConfidence: number
    calibratedConfidence: number
    calibratorVersion: string
  }): void {
    this.event.rawConfidence = result.rawConfidence
    this.event.calibratedConfidence = result.calibratedConfidence
    this.event.calibratorVersion = result.calibratorVersion
  }

  // Final resolution
  resolve(decision: ResolutionDecision, canonical: string, canonicalId?: string): void {
    this.event.decision = decision
    this.event.finalCanonical = canonical
    this.event.finalCanonicalId = canonicalId
    this.event.winningPhase = this.event.phasesReached?.at(-1)
  }

  fail(error: string): void {
    this.event.decision = 'failed'
    this.event.failureReason = error
    this.addPhase('failed')
  }

  // Emits to stdout + async DB write. Call once at the very end.
  emit(): ResolutionEvent {
    const complete: ResolutionEvent = {
      ...this.event as ResolutionEvent,
      totalLatencyMs: Date.now() - this.startedAt,
      createdAt: new Date().toISOString(),
    }

    // Layer 1: synchronous stdout — zero latency impact
    process.stdout.write(
      JSON.stringify({ _type: 'resolution_event', ...complete }) + '\n'
    )

    // Layer 2: async DB write — fire and forget
    writeResolutionLog(complete, this.candidates).catch(err =>
      process.stderr.write(`[obs] log write failed: ${err.message}\n`)
    )

    return complete
  }

  private addPhase(phase: ResolutionPhase): void {
    this.event.phasesReached = [...(this.event.phasesReached ?? []), phase]
  }
}
```

---

## Layer 2 — Database Schema

### Migration: `0012_resolution_observability.sql`

```sql
-- ============================================================
-- ingredient_resolution_log
-- One row per resolution attempt. Candidates as JSONB.
-- ============================================================
create table ingredient_resolution_log (
  id uuid primary key default gen_random_uuid(),

  -- Correlation
  event_id uuid not null unique,
  queue_row_id uuid references ingredient_match_queue(id) on delete set null,
  product_mapping_id uuid references product_mappings(id) on delete set null,
  recipe_ingredient_id uuid references recipe_ingredients(id) on delete set null,
  worker_run_id uuid not null,
  resolver text not null,

  -- Input
  raw_name text not null,
  cleaned_name text not null,
  context text not null check (context in ('scraper', 'recipe', 'pantry')),

  -- Pipeline path
  winning_phase text not null,
  phases_reached text[] not null default '{}',
  decision text not null,

  -- Output
  final_canonical_id uuid references standardized_ingredients(id) on delete set null,
  final_canonical_name text,
  raw_confidence numeric(5,4),
  calibrated_confidence numeric(5,4),
  calibrator_version text,

  -- Cache
  cache_checked boolean not null default false,
  cache_hit boolean not null default false,

  -- Vector
  vector_top_score numeric(5,4),
  vector_top_canonical text,
  vector_candidate_count integer,
  vector_embedding_model text,

  -- LLM
  llm_called boolean not null default false,
  llm_provider text,
  llm_model text,
  llm_latency_ms integer,
  llm_prompt_tokens integer,
  llm_completion_tokens integer,
  llm_output_canonical text,
  llm_output_confidence numeric(5,4),
  llm_error text,
  estimated_llm_cost_usd numeric(10,8),

  -- Key analytical flags
  llm_canonical_was_in_hint_pool boolean,   -- was in the injected hint list
  llm_canonical_was_in_vector_pool boolean, -- was anywhere in vector candidates
  double_check_changed boolean not null default false,
  double_check_original text,
  double_check_remapped text,
  double_check_similarity numeric(5,4),
  form_retention_overrode boolean not null default false,
  variety_retention_overrode boolean not null default false,
  retail_tokens_stripped boolean not null default false,

  -- Candidates as JSONB (avoids per-row explosion)
  -- [{canonical_id, canonical_name, source, rank, selected, scores:{...}, features:{...}}]
  candidates jsonb,

  -- Timing
  total_latency_ms integer,
  created_at timestamptz not null default now()
);

-- Targeted indexes only — this table will be large
create index idx_irl_created_at on ingredient_resolution_log (created_at desc);
create index idx_irl_winning_phase_decision on ingredient_resolution_log (winning_phase, decision);
create index idx_irl_llm_called on ingredient_resolution_log (llm_called, created_at desc)
  where llm_called = true;
create index idx_irl_worker_run on ingredient_resolution_log (worker_run_id);
create index idx_irl_double_check_changed on ingredient_resolution_log (double_check_changed)
  where double_check_changed = true;
create index idx_irl_final_canonical on ingredient_resolution_log (final_canonical_id)
  where final_canonical_id is not null;

-- ============================================================
-- ingredient_worker_run_log
-- One row per worker cycle. The operational dashboard source.
-- ============================================================
create table ingredient_worker_run_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  resolver text not null,

  -- Throughput
  items_claimed integer not null default 0,
  items_resolved integer not null default 0,
  items_failed integer not null default 0,
  items_probation integer not null default 0,

  -- Resolution breakdown (must sum to items_resolved)
  resolved_non_food_skip integer not null default 0,
  resolved_from_cache integer not null default 0,
  resolved_non_food_keyword integer not null default 0,
  resolved_vector_auto integer not null default 0,
  resolved_llm integer not null default 0,
  resolved_llm_double_check_overrode integer not null default 0,
  resolved_llm_form_overrode integer not null default 0,
  resolved_llm_variety_overrode integer not null default 0,

  -- LLM stats for this run
  llm_calls_total integer not null default 0,
  llm_calls_failed integer not null default 0,
  llm_hint_pool_hits integer not null default 0,   -- LLM picked from hint pool
  llm_hint_pool_misses integer not null default 0, -- LLM picked something new
  llm_p50_latency_ms integer,
  llm_p95_latency_ms integer,
  llm_total_prompt_tokens bigint not null default 0,
  llm_total_completion_tokens bigint not null default 0,
  estimated_run_cost_usd numeric(10,6),
  llm_provider text,
  llm_model text,

  -- Post-processing override counts
  double_check_remaps integer not null default 0,
  form_retention_overrides integer not null default 0,
  variety_retention_overrides integer not null default 0,

  -- Queue health at time of run
  queue_depth_at_start integer,
  queue_depth_at_end integer,
  oldest_pending_age_seconds integer,

  -- Timing
  run_duration_ms integer not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now()
);

create index idx_iwrl_completed_at on ingredient_worker_run_log (completed_at desc);

-- ============================================================
-- ingredient_queue_health_snapshots
-- Written every ~60s by snapshot_queue_health()
-- ============================================================
create table ingredient_queue_health_snapshots (
  id uuid primary key default gen_random_uuid(),

  pending_count integer not null,
  processing_count integer not null,
  failed_count integer not null,
  resolved_last_24h integer not null,

  oldest_pending_age_seconds integer,
  p50_queue_wait_seconds integer,
  p95_queue_wait_seconds integer,

  -- Stuck = processing but lease expired
  stuck_processing_count integer not null default 0,

  -- Running worker count (from distinct active resolvers)
  active_resolver_count integer not null default 0,

  snapshotted_at timestamptz not null default now()
);

create index idx_iqhs_snapshotted_at on ingredient_queue_health_snapshots (snapshotted_at desc);

-- ============================================================
-- Retention: auto-delete resolution log rows > 90 days
-- Run via pg_cron or a nightly script
-- ============================================================
-- select cron.schedule('obs-retention', '0 3 * * *',
--   'delete from ingredient_resolution_log where created_at < now() - interval ''90 days''');
```

---

## Layer 3 — Integration Points in `processor.ts`

These are the exact locations in the existing code where the observer hooks in. No matching logic changes — only observation calls.

```ts
// queue/worker/processor.ts

import { ResolutionObserver } from '../../lib/observability/resolution-observer'
import { WorkerRunAccumulator } from '../../lib/observability/worker-run-accumulator'

async function resolveBatch(rows: QueueRow[], runId: string): Promise<void> {
  const runAcc = new WorkerRunAccumulator(runId)

  for (const row of rows) {
    const obs = new ResolutionObserver({
      queueRowId: row.id,
      productMappingId: row.product_mapping_id,
      recipeIngredientId: row.recipe_ingredient_id,
      rawName: row.raw_product_name,
      cleanedName: row.cleaned_name,
      context: row.source,
      workerRunId: runId,
    })

    try {
      // ── Non-food short circuit ──────────────────────────────
      if (isKnownNonFood(row)) {
        obs.resolve('resolved_non_food_skip', '', undefined)
        await markResolved(row, ...)
        runAcc.record(obs.emit())
        continue
      }

      // ── Unit pass 1 (no instrumentation needed here) ────────
      const unitPass1 = await resolveUnitCandidates(row)

      // ── SQLite cache check ──────────────────────────────────
      const cacheKey = `${row.source}:${row.cleaned_name}`
      const cached = await localQueueAICache.getMany([cacheKey])
      if (cached[cacheKey]) {
        obs.recordCacheCheck(true, cached[cacheKey].canonicalName)
        obs.resolve('resolved_from_cache', cached[cacheKey].canonicalName, cached[cacheKey].canonicalId)
        await markResolved(row, ...)
        runAcc.record(obs.emit())
        continue
      }
      obs.recordCacheCheck(false)

      // ── likelyNonFoodByKeyword guard ─────────────────────────
      if (likelyNonFoodByKeyword(row.cleaned_name)) {
        obs.resolve('resolved_non_food_keyword', '')
        await markProbation(row, ...)
        runAcc.record(obs.emit())
        continue
      }

      // ── Vector fast-path ─────────────────────────────────────
      const vectorResult = await resolveVectorMatch(row.cleaned_name, row.source)
      obs.recordVectorResult({
        topScore: vectorResult.topScore,
        topCanonical: vectorResult.topCanonical,
        candidateCount: vectorResult.candidates.length,
        autoResolved: vectorResult.topScore >= 0.93,
        embeddingModel: EMBEDDING_MODEL,
        candidates: vectorResult.candidates.map((c, i) => ({
          canonicalId: c.id,
          canonicalName: c.name,
          sources: ['vector'],
          rank: i,
          selected: i === 0 && vectorResult.topScore >= 0.93,
          scores: { embedding: c.score, finalRerank: c.rerankScore },
          features: {
            headNounMatch: c.headNounBonus > 0,
            categoryMatch: c.categoryPenalty === 0,
            formMatch: c.formPenalty === 0,
            contextMatch: true,
          }
        }))
      })

      if (vectorResult.topScore >= 0.93) {
        obs.resolve('resolved_vector_auto', vectorResult.topCanonical, vectorResult.topCanonicalId)
        await markResolved(row, ...)
        runAcc.record(obs.emit())
        continue
      }

      // ── Vector hint injection + LLM ──────────────────────────
      const hints = await resolveVectorCandidates(row.cleaned_name, row.source)
      const hintNames = hints.map(h => h.canonicalName)

      const llmStart = Date.now()
      const llmResult = await runStandardizerProcessor([row], { hints })
      const itemResult = llmResult[row.id]

      obs.recordLLMCall({
        provider: LLM_PROVIDER,
        model: LLM_MODEL,
        latencyMs: Date.now() - llmStart,
        promptTokens: itemResult.usage?.prompt_tokens ?? 0,
        completionTokens: itemResult.usage?.completion_tokens ?? 0,
        outputCanonical: itemResult.canonicalName,
        outputCategory: itemResult.category,
        outputConfidence: itemResult.confidence,
        error: itemResult.error,
        hintCandidates: hintNames,
      })

      // ── Post-LLM: double-check ───────────────────────────────
      const dcResult = await resolveCanonicalWithDoubleCheck(itemResult.canonicalName)
      obs.recordDoubleCheck({
        changed: dcResult.changed,
        originalCanonical: itemResult.canonicalName,
        remappedCanonical: dcResult.changed ? dcResult.canonical : undefined,
        similarityScore: dcResult.score,
      })

      // ── Post-LLM: form retention ─────────────────────────────
      const afterForm = maybeRetainFormSpecificCanonical(
        dcResult.canonical, row.cleaned_name
      )
      if (afterForm !== dcResult.canonical) {
        obs.recordRetentionOverride('form', dcResult.canonical, afterForm)
      }

      // ── Post-LLM: variety retention ──────────────────────────
      const afterVariety = maybeRetainVarietyCanonical(afterForm, row.cleaned_name)
      if (afterVariety !== afterForm) {
        obs.recordRetentionOverride('variety', afterForm, afterVariety)
      }

      // ── Retail suffix stripping ──────────────────────────────
      const afterStrip = stripRetailSuffixTokensFromCanonicalName(afterVariety)
      obs.recordRetailStripResult(afterStrip !== afterVariety, afterVariety, afterStrip)

      // ── Confidence calibration (already exists) ──────────────
      const calibrated = confidenceCalibrator.calibrate(itemResult.confidence, afterStrip)
      obs.recordCalibration({
        rawConfidence: itemResult.confidence,
        calibratedConfidence: calibrated.confidence,
        calibratorVersion: calibrated.version,
      })

      // ── Final resolution ─────────────────────────────────────
      const finalDecision = dcResult.changed
        ? 'resolved_llm_double_check_overrode'
        : afterForm !== dcResult.canonical
          ? 'resolved_llm_form_overrode'
          : afterVariety !== afterForm
            ? 'resolved_llm_variety_overrode'
            : 'resolved_llm'

      obs.resolve(finalDecision, afterStrip, resolvedId)
      await markResolved(row, ...)

    } catch (err) {
      obs.fail(err.message)
      await markFailed(row, ...)
    }

    runAcc.record(obs.emit())
  }

  // Write the run summary row
  await runAcc.flush()
}
```

---

## Layer 4 — `WorkerRunAccumulator`

Aggregates per-item events into the run summary row. Entirely synchronous accumulation, one async flush at the end of the cycle.

```ts
// lib/observability/worker-run-accumulator.ts

export class WorkerRunAccumulator {
  private runId: string
  private startedAt: number
  private counts = {
    claimed: 0, resolved: 0, failed: 0, probation: 0,
    resolvedNonFoodSkip: 0, resolvedFromCache: 0,
    resolvedNonFoodKeyword: 0, resolvedVectorAuto: 0,
    resolvedLlm: 0, resolvedLlmDoubleCheckOverrode: 0,
    resolvedLlmFormOverrode: 0, resolvedLlmVarietyOverrode: 0,
    llmCallsTotal: 0, llmCallsFailed: 0,
    llmHintPoolHits: 0, llmHintPoolMisses: 0,
    doubleCheckRemaps: 0, formRetentionOverrides: 0, varietyRetentionOverrides: 0,
  }
  private llmLatencies: number[] = []
  private totalPromptTokens = 0
  private totalCompletionTokens = 0
  private llmProvider?: string
  private llmModel?: string

  constructor(runId: string) {
    this.runId = runId
    this.startedAt = Date.now()
  }

  record(event: ResolutionEvent): void {
    this.counts.claimed++
    if (event.decision?.startsWith('resolved')) this.counts.resolved++
    if (event.decision === 'failed') this.counts.failed++
    if (event.decision === 'probation') this.counts.probation++

    // Resolution method breakdown
    const decisionKey = toCamelCase(event.decision) // e.g. 'resolvedLlm'
    if (decisionKey in this.counts) (this.counts as any)[decisionKey]++

    if (event.llmCalled) {
      this.counts.llmCallsTotal++
      if (event.llmError) this.counts.llmCallsFailed++
      if (event.llmCanonicalWasInHintPool) this.counts.llmHintPoolHits++
      else this.counts.llmHintPoolMisses++
      if (event.llmLatencyMs) this.llmLatencies.push(event.llmLatencyMs)
      this.totalPromptTokens += event.llmPromptTokens ?? 0
      this.totalCompletionTokens += event.llmCompletionTokens ?? 0
      this.llmProvider = event.llmProvider
      this.llmModel = event.llmModel
    }

    if (event.doubleCheckChanged) this.counts.doubleCheckRemaps++
    if (event.formRetentionOverrode) this.counts.formRetentionOverrides++
    if (event.varietyRetentionOverrode) this.counts.varietyRetentionOverrides++
  }

  async flush(queueDepthStart?: number, queueDepthEnd?: number): Promise<void> {
    const sorted = [...this.llmLatencies].sort((a, b) => a - b)
    const p = (pct: number) => sorted[Math.floor(sorted.length * pct)] ?? null

    await supabase.from('ingredient_worker_run_log').insert({
      run_id: this.runId,
      resolver: process.env.QUEUE_RESOLVER_ID ?? 'worker',
      ...this.counts,
      llm_p50_latency_ms: p(0.5),
      llm_p95_latency_ms: p(0.95),
      llm_total_prompt_tokens: this.totalPromptTokens,
      llm_total_completion_tokens: this.totalCompletionTokens,
      estimated_run_cost_usd: estimateRunCost(this.llmProvider, this.llmModel,
        this.totalPromptTokens, this.totalCompletionTokens),
      llm_provider: this.llmProvider,
      llm_model: this.llmModel,
      queue_depth_at_start: queueDepthStart,
      queue_depth_at_end: queueDepthEnd,
      run_duration_ms: Date.now() - this.startedAt,
      started_at: new Date(this.startedAt).toISOString(),
    })
  }
}
```

---

## Layer 5 — Queue Health Snapshot RPC

Replaces the current absence of time-series queue health data.

```sql
create or replace function snapshot_queue_health()
returns void
language plpgsql
security definer
as $$
declare
  v_pending int;
  v_processing int;
  v_failed int;
  v_resolved_24h int;
  v_oldest_pending_secs int;
  v_p50_wait_secs int;
  v_p95_wait_secs int;
  v_stuck int;
  v_active_resolvers int;
begin
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'resolved'
                    and resolved_at > now() - interval '24 hours')
  into v_pending, v_processing, v_failed, v_resolved_24h
  from ingredient_match_queue;

  select
    extract(epoch from (now() - min(created_at)))::int
  into v_oldest_pending_secs
  from ingredient_match_queue
  where status = 'pending';

  select
    percentile_cont(0.50) within group (
      order by extract(epoch from (processing_started_at - created_at))
    )::int,
    percentile_cont(0.95) within group (
      order by extract(epoch from (processing_started_at - created_at))
    )::int
  into v_p50_wait_secs, v_p95_wait_secs
  from ingredient_match_queue
  where status = 'resolved'
    and processing_started_at is not null
    and created_at > now() - interval '1 hour';

  select count(*)
  into v_stuck
  from ingredient_match_queue
  where status = 'processing'
    and processing_lease_expires_at < now();

  select count(distinct resolved_by)
  into v_active_resolvers
  from ingredient_match_queue
  where status = 'processing'
    and processing_lease_expires_at > now();

  insert into ingredient_queue_health_snapshots (
    pending_count, processing_count, failed_count, resolved_last_24h,
    oldest_pending_age_seconds, p50_queue_wait_seconds, p95_queue_wait_seconds,
    stuck_processing_count, active_resolver_count
  ) values (
    v_pending, v_processing, v_failed, v_resolved_24h,
    v_oldest_pending_secs, v_p50_wait_secs, v_p95_wait_secs,
    v_stuck, v_active_resolvers
  );
end;
$$;
```

Call this from `runner.ts` at the top and bottom of each worker cycle — two rows per cycle, giving you before/after queue depth without needing a separate polling process.

---

## Layer 6 — The Operational Query Set

These answer the four guiding questions directly. Save them as a `scripts/baseline-report.ts` that runs once after 7 days of data collection.

```sql
-- ① Where is each resolution coming from?
select
  date_trunc('hour', created_at) as hour,
  winning_phase,
  count(*) as n,
  round(count(*)::numeric / sum(count(*)) over (
    partition by date_trunc('hour', created_at)
  ), 3) as share
from ingredient_resolution_log
where created_at > now() - interval '7 days'
group by 1, 2
order by 1 desc, 3 desc;

-- ② Is the LLM a reranker or a recall engine?
-- High hint_pool_hit_rate → LLM mostly reranking → calibrated reranker is high leverage
-- Low hint_pool_hit_rate → LLM finding new canonicals → alias graph is high leverage
select
  date_trunc('day', created_at) as day,
  count(*) filter (where llm_called) as llm_calls,
  count(*) filter (where llm_called and llm_canonical_was_in_hint_pool) as hint_hits,
  count(*) filter (where llm_called and llm_canonical_was_in_vector_pool
                        and not llm_canonical_was_in_hint_pool) as vector_only_hits,
  count(*) filter (where llm_called and not llm_canonical_was_in_vector_pool) as true_misses,
  round(
    count(*) filter (where llm_called and llm_canonical_was_in_hint_pool)::numeric
    / nullif(count(*) filter (where llm_called), 0), 3
  ) as hint_pool_hit_rate
from ingredient_resolution_log
where created_at > now() - interval '7 days'
group by 1 order by 1 desc;

-- ③ How often does double-check/form/variety override the LLM?
-- High rate = LLM output quality problem OR post-processing is too aggressive
select
  date_trunc('day', created_at) as day,
  count(*) filter (where llm_called) as llm_calls,
  count(*) filter (where double_check_changed) as double_check_overrides,
  count(*) filter (where form_retention_overrode) as form_overrides,
  count(*) filter (where variety_retention_overrode) as variety_overrides,
  round(
    (count(*) filter (where double_check_changed)
     + count(*) filter (where form_retention_overrode)
     + count(*) filter (where variety_retention_overrode))::numeric
    / nullif(count(*) filter (where llm_called), 0), 3
  ) as total_override_rate
from ingredient_resolution_log
where created_at > now() - interval '7 days'
group by 1 order by 1 desc;

-- ④ Queue health trend
select
  date_trunc('hour', snapshotted_at) as hour,
  avg(pending_count)::int as avg_pending,
  max(oldest_pending_age_seconds)::int as max_oldest_secs,
  max(p95_queue_wait_seconds)::int as p95_wait_secs,
  max(stuck_processing_count)::int as max_stuck
from ingredient_queue_health_snapshots
where snapshotted_at > now() - interval '7 days'
group by 1 order by 1 desc;

-- ⑤ What does the LLM invent that wasn't in the vector pool?
-- These are the true pool misses — spot-check for hallucinations vs genuine value
select
  raw_name,
  cleaned_name,
  context,
  llm_output_canonical,
  final_canonical_name,
  llm_output_confidence,
  calibrated_confidence,
  double_check_changed,
  double_check_remapped,
  created_at
from ingredient_resolution_log
where llm_called
  and llm_canonical_was_in_vector_pool = false
  and decision not in ('failed', 'probation')
  and created_at > now() - interval '7 days'
order by calibrated_confidence asc  -- low confidence misses are highest risk
limit 200;

-- ⑥ Daily cost
select
  date_trunc('day', started_at) as day,
  sum(llm_calls_total) as llm_calls,
  sum(estimated_run_cost_usd) as cost_usd,
  round(sum(estimated_run_cost_usd) /
    nullif(sum(llm_calls_total), 0), 8) as cost_per_call,
  sum(llm_total_prompt_tokens) as prompt_tokens,
  sum(llm_total_completion_tokens) as completion_tokens
from ingredient_worker_run_log
where started_at > now() - interval '30 days'
group by 1 order by 1 desc;

-- ⑦ Confidence calibrator: raw vs calibrated delta by phase
-- Tells you if calibrator is well-tuned per resolution method
select
  winning_phase,
  count(*) as n,
  round(avg(raw_confidence)::numeric, 3) as avg_raw,
  round(avg(calibrated_confidence)::numeric, 3) as avg_calibrated,
  round(avg(calibrated_confidence - raw_confidence)::numeric, 3) as avg_delta,
  round(stddev(calibrated_confidence)::numeric, 3) as stddev_calibrated
from ingredient_resolution_log
where calibrated_confidence is not null
  and created_at > now() - interval '7 days'
group by 1 order by 2 desc;
```

---

## Layer 7 — Alert Definitions

Implementable as a nightly script (`scripts/check-obs-alerts.ts`) that queries the snapshot tables and fails the GitHub Action if thresholds are breached.

```ts
// scripts/check-obs-alerts.ts
const alerts = [
  {
    name: 'queue_backlog',
    severity: 'high',
    query: `select max(pending_count) as val
            from ingredient_queue_health_snapshots
            where snapshotted_at > now() - interval '10 minutes'`,
    threshold: 500,
    condition: (val: number) => val > 500,
    message: (val: number) => `Queue backlog: ${val} pending items`,
  },
  {
    name: 'queue_p95_lag',
    severity: 'high',
    query: `select max(p95_queue_wait_seconds) as val
            from ingredient_queue_health_snapshots
            where snapshotted_at > now() - interval '10 minutes'`,
    threshold: 600,
    condition: (val: number) => val > 600,
    message: (val: number) => `p95 queue wait: ${val}s (threshold 600s)`,
  },
  {
    name: 'stuck_items',
    severity: 'high',
    query: `select max(stuck_processing_count) as val
            from ingredient_queue_health_snapshots
            where snapshotted_at > now() - interval '10 minutes'`,
    threshold: 10,
    condition: (val: number) => val > 10,
    message: (val: number) => `${val} stuck processing rows (lease expired)`,
  },
  {
    name: 'llm_error_rate',
    severity: 'medium',
    query: `select round(sum(llm_calls_failed)::numeric /
                   nullif(sum(llm_calls_total), 0), 3) as val
            from ingredient_worker_run_log
            where started_at > now() - interval '1 hour'`,
    threshold: 0.05,
    condition: (val: number) => val > 0.05,
    message: (val: number) => `LLM error rate: ${(val * 100).toFixed(1)}%`,
  },
  {
    name: 'double_check_spike',
    severity: 'medium',
    query: `select round(
              count(*) filter (where double_check_changed)::numeric
              / nullif(count(*) filter (where llm_called), 0), 3
            ) as val
            from ingredient_resolution_log
            where created_at > now() - interval '1 hour'
              and llm_called = true`,
    threshold: 0.25,
    condition: (val: number) => val > 0.25,
    message: (val: number) => `Double-check override rate: ${(val * 100).toFixed(1)}%`,
  },
  {
    name: 'zero_throughput',
    severity: 'high',
    query: `select sum(items_resolved) as val
            from ingredient_worker_run_log
            where started_at > now() - interval '30 minutes'`,
    threshold: 0,
    condition: (val: number) => val === 0,
    message: () => 'Zero items resolved in last 30 minutes',
  },
]
```

---

## Baseline Commitment

After 7 days of clean data, the baseline report produces these numbers and they get committed as constants to `lib/observability/baseline.ts`:

```ts
export const BASELINE = {
  llmCallRate: 0.xx,               // % of resolutions that hit the LLM
  hintPoolHitRate: 0.xx,           // % of LLM calls where answer was in hint pool
  doubleCheckOverrideRate: 0.xx,   // % of LLM calls overridden by double-check
  vectorAutoResolveRate: 0.xx,     // % resolved at vector fast-path
  cacheHitRate: 0.xx,              // % resolved from SQLite cache
  p95QueueWaitSeconds: xx,
  p50ResolutionLatencyMs: xx,
  dailyLlmCostUsd: x.xx,
  failureRate: 0.xx,
} as const
```

No phase of the enhanced standardizer plan ships without demonstrating movement in at least one of these numbers without regression in the others. This baseline is the acceptance gate, not a dashboard curiosity.