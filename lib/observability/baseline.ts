/**
 * Baseline metrics shape and SQL definitions for the Phase 0 ingredient standardizer report.
 * Import the interface and SQL constants from here rather than re-defining them elsewhere.
 */

export interface IngredientResolutionBaseline {
  generatedAt: string
  windowDays: number
  dataFrom: string | null
  dataTo: string | null

  // Volume
  totalEvents: number
  totalRuns: number
  totalClaimed: number

  // Resolution path rates (fraction of total events, 0–1)
  llmCallRate: number | null
  vectorAutoResolveRate: number | null
  cacheHitRate: number | null

  // LLM quality rates (fraction of LLM-called events, 0–1)
  llmHintPoolHitRate: number | null
  llmTrueMissRate: number | null

  // Post-processing override rates (fraction of resolved events, 0–1)
  doubleCheckRemapRate: number | null
  formRetentionOverrideRate: number | null
  varietyRetentionOverrideRate: number | null
  semanticDedupRemapRate: number | null

  // Failure rates (fraction of total events, 0–1)
  failureRate: number | null
  probationRate: number | null

  // Latency (ms) — sourced from ingredient_resolution_log.total_latency_ms
  p50LatencyMs: number | null
  p95LatencyMs: number | null

  // Queue health — averaged over the window from ingredient_queue_health_snapshots
  avgPendingDepth: number | null
  avgResolvedLast24h: number | null
  avgP95QueueWaitSeconds: number | null
  latestPendingDepth: number | null
}

export const BASELINE_MIN_EVENTS = 100
export const BASELINE_MIN_DAYS = 7

export function isSufficientForBaseline(b: IngredientResolutionBaseline): boolean {
  return b.totalEvents >= BASELINE_MIN_EVENTS && b.totalRuns >= 1
}

// ── SQL query strings ────────────────────────────────────────────────────────
// These are the canonical queries used by the baseline report script and can
// be imported by any future tooling that needs to reproduce the same numbers.

export const SQL_RESOLUTION_LOG = `
select
  count(*)                                                                       as total_events,
  round(count(*) filter (where llm_called)::numeric
    / nullif(count(*), 0), 4)                                                    as llm_call_rate,
  round(count(*) filter (where decision = 'resolved_vector_auto')::numeric
    / nullif(count(*), 0), 4)                                                    as vector_auto_rate,
  round(count(*) filter (where decision = 'resolved_from_cache')::numeric
    / nullif(count(*), 0), 4)                                                    as cache_hit_rate,
  round(count(*) filter (where llm_called and llm_canonical_was_in_hint_pool = true)::numeric
    / nullif(count(*) filter (where llm_called), 0), 4)                          as llm_hint_pool_hit_rate,
  round(count(*) filter (where llm_called and llm_canonical_was_in_hint_pool = false)::numeric
    / nullif(count(*) filter (where llm_called), 0), 4)                          as llm_true_miss_rate,
  round(count(*) filter (where double_check_changed)::numeric
    / nullif(count(*) filter (where decision like 'resolved%'), 0), 4)           as double_check_remap_rate,
  round(count(*) filter (where form_retention_overrode)::numeric
    / nullif(count(*) filter (where decision like 'resolved%'), 0), 4)           as form_retention_rate,
  round(count(*) filter (where variety_retention_overrode)::numeric
    / nullif(count(*) filter (where decision like 'resolved%'), 0), 4)           as variety_retention_rate,
  round(count(*) filter (where semantic_dedup_changed)::numeric
    / nullif(count(*) filter (where decision like 'resolved%'), 0), 4)           as semantic_dedup_rate,
  round(count(*) filter (where decision = 'failed')::numeric
    / nullif(count(*), 0), 4)                                                    as failure_rate,
  round(count(*) filter (where decision = 'probation')::numeric
    / nullif(count(*), 0), 4)                                                    as probation_rate,
  percentile_cont(0.50) within group (order by total_latency_ms)::numeric        as p50_latency_ms,
  percentile_cont(0.95) within group (order by total_latency_ms)::numeric        as p95_latency_ms,
  min(created_at)                                                                as data_from,
  max(created_at)                                                                as data_to
from ingredient_resolution_log
where created_at > now() - interval '$DAYS days'
`.trim()

export const SQL_WORKER_RUN_LOG = `
select
  count(*)           as total_runs,
  sum(items_claimed) as total_claimed
from ingredient_worker_run_log
where started_at > now() - interval '$DAYS days'
`.trim()

export const SQL_QUEUE_HEALTH = `
select
  round(avg(pending_count))            as avg_pending,
  round(avg(resolved_last_24h))        as avg_resolved_24h,
  round(avg(p95_queue_wait_seconds))   as avg_p95_wait_secs,
  (select pending_count
   from ingredient_queue_health_snapshots
   order by snapshotted_at desc limit 1) as latest_pending
from ingredient_queue_health_snapshots
where snapshotted_at > now() - interval '$DAYS days'
`.trim()
