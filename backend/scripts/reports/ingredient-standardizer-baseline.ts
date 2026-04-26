#!/usr/bin/env tsx
/**
 * Phase 0 baseline report for the ingredient standardizer.
 *
 * Usage:
 *   tsx ingredient-standardizer-baseline.ts [--days N] [--json]
 *
 *   --days N   Lookback window in days (default: 7)
 *   --json     Emit raw JSON instead of the formatted table
 *
 * The JSON output can be committed to lib/observability/baseline.ts
 * as the accepted baseline once 7+ days of clean data exist.
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import type { IngredientResolutionBaseline } from "../../../lib/observability/baseline"
import baselineModule from "../../../lib/observability/baseline"

const {
  isSufficientForBaseline,
  SQL_RESOLUTION_LOG,
  SQL_WORKER_RUN_LOG,
  SQL_QUEUE_HEALTH,
} = baselineModule

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const jsonMode = args.includes("--json")
const daysArg = args[args.indexOf("--days") + 1]
const DAYS = daysArg && Number.isFinite(Number(daysArg)) ? Number(daysArg) : 7

// ── Supabase client ───────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Query helpers ─────────────────────────────────────────────────────────────

function interpolate(sql: string): string {
  return sql.replace(/\$DAYS/g, String(DAYS))
}

async function query<T>(sql: string): Promise<T> {
  const { data, error } = await db.rpc("execute_sql" as never, { query: sql }).single()
  if (error) throw error
  return data as T
}

async function rawQuery<T>(sql: string): Promise<T[]> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`SQL error (${resp.status}): ${text}`)
  }
  return resp.json() as Promise<T[]>
}

// Supabase exposes raw SQL via the pg REST interface through the service role.
// We use `supabase.from("...").select()` where possible, but for arbitrary
// aggregation queries we call the Postgres REST endpoint directly.
async function execSql<T extends Record<string, unknown>>(sql: string): Promise<T> {
  const { data, error } = await (db as ReturnType<typeof createClient>)
    .rpc("query" as never, { sql })
    .single<T>()

  if (!error && data) return data as T

  // Fallback: direct postgres endpoint (service role only)
  const resp = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "X-Prefer": "return=representation",
    },
    body: JSON.stringify({ query: sql }),
  })

  throw new Error(
    `Cannot execute raw SQL without a server-side function. ` +
    `Run this script with SUPABASE_SERVICE_ROLE_KEY set and a \`query\` RPC available, ` +
    `or use the Supabase MCP execute_sql tool directly.\n` +
    `SQL:\n${sql}`
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type ResolutionRow = {
  total_events: string
  llm_call_rate: string | null
  vector_auto_rate: string | null
  cache_hit_rate: string | null
  llm_hint_pool_hit_rate: string | null
  llm_true_miss_rate: string | null
  double_check_remap_rate: string | null
  form_retention_rate: string | null
  variety_retention_rate: string | null
  semantic_dedup_rate: string | null
  failure_rate: string | null
  probation_rate: string | null
  p50_latency_ms: string | null
  p95_latency_ms: string | null
  data_from: string | null
  data_to: string | null
}

type RunRow = {
  total_runs: string
  total_claimed: string | null
}

type HealthRow = {
  avg_pending: string | null
  avg_resolved_24h: string | null
  avg_p95_wait_secs: string | null
  latest_pending: string | null
}

function num(v: string | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pct(v: number | null): string {
  if (v == null) return "n/a"
  return `${(v * 100).toFixed(1)}%`
}

function ms(v: number | null): string {
  if (v == null) return "n/a"
  return `${Math.round(v)}ms`
}

function row(label: string, value: string, note?: string): void {
  const col1 = label.padEnd(36)
  const col2 = value.padStart(10)
  console.log(`  ${col1}${col2}${note ? `   (${note})` : ""}`)
}

async function main(): Promise<void> {
  // Run all three queries in parallel using the Supabase PostgREST SQL endpoint
  const runQueries = async () => {
    const headers = {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey!}`,
      "Content-Type": "application/json",
    }

    const post = async (sql: string) => {
      const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: sql }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        // If the RPC doesn't exist, surface a clear message
        if (resp.status === 404 || text.includes("does not exist")) {
          throw new Error(
            "exec_sql RPC not found. Create it with:\n\n" +
            "  create or replace function exec_sql(query text)\n" +
            "  returns json language plpgsql security definer as $$\n" +
            "  declare result json;\n" +
            "  begin\n" +
            "    execute 'select row_to_json(t) from (' || query || ') t' into result;\n" +
            "    return result;\n" +
            "  end;\n" +
            "  $$;\n"
          )
        }
        throw new Error(`SQL failed (${resp.status}): ${text}`)
      }

      return resp.json()
    }

    const [resRow, runRow, healthRow] = await Promise.all([
      post(interpolate(SQL_RESOLUTION_LOG)),
      post(interpolate(SQL_WORKER_RUN_LOG)),
      post(interpolate(SQL_QUEUE_HEALTH)),
    ])

    return { resRow, runRow, healthRow }
  }

  let resRow: ResolutionRow
  let runRow: RunRow
  let healthRow: HealthRow

  try {
    const result = await runQueries()
    resRow = result.resRow as ResolutionRow
    runRow = result.runRow as RunRow
    healthRow = result.healthRow as HealthRow
  } catch (err) {
    // If exec_sql RPC doesn't exist, fall back to querying tables directly via PostgREST
    // and computing aggregates in-process. Slower but no DDL required.
    console.warn(`[baseline] RPC unavailable — falling back to direct table queries: ${(err as Error).message}`)
    resRow = await queryResolutionLogDirect()
    runRow = await queryWorkerRunLogDirect()
    healthRow = await queryQueueHealthDirect()
  }

  const baseline: IngredientResolutionBaseline = {
    generatedAt: new Date().toISOString(),
    windowDays: DAYS,
    dataFrom: resRow.data_from ?? null,
    dataTo: resRow.data_to ?? null,
    totalEvents: Number(resRow.total_events ?? 0),
    totalRuns: Number(runRow.total_runs ?? 0),
    totalClaimed: num(runRow.total_claimed) ?? 0,
    llmCallRate: num(resRow.llm_call_rate),
    vectorAutoResolveRate: num(resRow.vector_auto_rate),
    cacheHitRate: num(resRow.cache_hit_rate),
    llmHintPoolHitRate: num(resRow.llm_hint_pool_hit_rate),
    llmTrueMissRate: num(resRow.llm_true_miss_rate),
    doubleCheckRemapRate: num(resRow.double_check_remap_rate),
    formRetentionOverrideRate: num(resRow.form_retention_rate),
    varietyRetentionOverrideRate: num(resRow.variety_retention_rate),
    semanticDedupRemapRate: num(resRow.semantic_dedup_rate),
    failureRate: num(resRow.failure_rate),
    probationRate: num(resRow.probation_rate),
    p50LatencyMs: num(resRow.p50_latency_ms),
    p95LatencyMs: num(resRow.p95_latency_ms),
    avgPendingDepth: num(healthRow.avg_pending),
    avgResolvedLast24h: num(healthRow.avg_resolved_24h),
    avgP95QueueWaitSeconds: num(healthRow.avg_p95_wait_secs),
    latestPendingDepth: num(healthRow.latest_pending),
  }

  if (jsonMode) {
    console.log(JSON.stringify(baseline, null, 2))
    return
  }

  // ── Formatted report ───────────────────────────────────────────────────────
  const sufficient = isSufficientForBaseline(baseline)
  const windowLabel = `last ${DAYS} days`

  console.log()
  console.log("╔══════════════════════════════════════════════════════╗")
  console.log("║   Ingredient Standardizer — Baseline Report           ║")
  console.log("╚══════════════════════════════════════════════════════╝")
  console.log(`  Generated : ${baseline.generatedAt}`)
  console.log(`  Window    : ${windowLabel}`)
  if (baseline.dataFrom) {
    console.log(`  Data from : ${baseline.dataFrom}`)
    console.log(`  Data to   : ${baseline.dataTo}`)
  }
  console.log()

  if (!sufficient) {
    console.log("  ⚠  Insufficient data for a valid baseline.")
    console.log(`     Events in window: ${baseline.totalEvents} (need ≥ 100)`)
    console.log(`     Runs in window  : ${baseline.totalRuns} (need ≥ 1)`)
    console.log()
    console.log("  The observability tables exist and are being queried correctly.")
    console.log("  Run the ingredient worker and return once 7 days of data exist.")
    console.log()
    return
  }

  console.log("── Volume ───────────────────────────────────────────────")
  row("Events in window", String(baseline.totalEvents))
  row("Worker runs", String(baseline.totalRuns))
  row("Items claimed", String(baseline.totalClaimed))
  console.log()

  console.log("── Resolution path rates ─────────────────────────────────")
  row("LLM call rate", pct(baseline.llmCallRate))
  row("Vector auto-resolve rate", pct(baseline.vectorAutoResolveRate))
  row("SQLite cache hit rate", pct(baseline.cacheHitRate))
  row("LLM hint-pool hit rate", pct(baseline.llmHintPoolHitRate), "of LLM calls")
  row("LLM true-miss rate", pct(baseline.llmTrueMissRate), "of LLM calls")
  console.log()

  console.log("── Post-processing override rates ───────────────────────")
  row("Double-check remap rate", pct(baseline.doubleCheckRemapRate), "of resolved")
  row("Form retention override rate", pct(baseline.formRetentionOverrideRate), "of resolved")
  row("Variety retention override rate", pct(baseline.varietyRetentionOverrideRate), "of resolved")
  row("Semantic dedup remap rate", pct(baseline.semanticDedupRemapRate), "of resolved")
  console.log()

  console.log("── Failure rates ─────────────────────────────────────────")
  row("Failure rate", pct(baseline.failureRate))
  row("Probation rate", pct(baseline.probationRate))
  console.log()

  console.log("── Latency ───────────────────────────────────────────────")
  row("p50 resolution latency", ms(baseline.p50LatencyMs))
  row("p95 resolution latency", ms(baseline.p95LatencyMs))
  console.log()

  if (baseline.avgPendingDepth != null) {
    console.log("── Queue health (avg over window) ────────────────────────")
    row("Avg pending depth", String(baseline.avgPendingDepth))
    row("Avg resolved last 24h", String(baseline.avgResolvedLast24h ?? "n/a"))
    row("Avg p95 queue wait", `${baseline.avgP95QueueWaitSeconds ?? "n/a"}s`)
    row("Latest pending depth", String(baseline.latestPendingDepth ?? "n/a"))
    console.log()
  }

  console.log("── Acceptance gate ───────────────────────────────────────")
  console.log("  Phase 1 may proceed when this report shows ≥ 7 days of")
  console.log("  clean data and the numbers above are committed as the")
  console.log("  baseline (run with --json and save the output).")
  console.log()
}

// ── Direct table fallbacks (no RPC needed) ────────────────────────────────────
// These pull raw rows and compute aggregates in-process.
// Less efficient but avoids the need for a custom SQL RPC function.

async function fetchAll<T>(table: string, filter?: string): Promise<T[]> {
  let url = `${supabaseUrl}/rest/v1/${table}?select=*`
  if (filter) url += `&${filter}`
  const resp = await fetch(url, {
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey!}`,
      "Range": "0-9999",
    },
  })
  if (!resp.ok) throw new Error(`fetchAll ${table} failed: ${await resp.text()}`)
  return resp.json() as Promise<T[]>
}

type IRL = {
  llm_called: boolean
  decision: string | null
  llm_canonical_was_in_hint_pool: boolean | null
  double_check_changed: boolean
  form_retention_overrode: boolean
  variety_retention_overrode: boolean
  semantic_dedup_changed: boolean
  total_latency_ms: number
  created_at: string
}

async function queryResolutionLogDirect(): Promise<ResolutionRow> {
  const cutoff = new Date(Date.now() - DAYS * 86400_000).toISOString()
  const rows = await fetchAll<IRL>(
    "ingredient_resolution_log",
    `created_at=gte.${cutoff}&order=created_at.desc`
  )

  if (!rows.length) {
    return {
      total_events: "0", llm_call_rate: null, vector_auto_rate: null,
      cache_hit_rate: null, llm_hint_pool_hit_rate: null, llm_true_miss_rate: null,
      double_check_remap_rate: null, form_retention_rate: null, variety_retention_rate: null,
      semantic_dedup_rate: null, failure_rate: null, probation_rate: null,
      p50_latency_ms: null, p95_latency_ms: null, data_from: null, data_to: null,
    }
  }

  const n = rows.length
  const resolved = rows.filter(r => r.decision?.startsWith("resolved"))
  const llmRows = rows.filter(r => r.llm_called)

  const rate = (count: number, denom: number) =>
    denom ? String((count / denom).toFixed(4)) : null

  const sorted = [...rows].sort((a, b) => a.total_latency_ms - b.total_latency_ms)
  const p50 = sorted[Math.floor(sorted.length * 0.50)]?.total_latency_ms ?? null
  const p95 = sorted[Math.floor(sorted.length * 0.95)]?.total_latency_ms ?? null

  return {
    total_events: String(n),
    llm_call_rate: rate(llmRows.length, n),
    vector_auto_rate: rate(rows.filter(r => r.decision === "resolved_vector_auto").length, n),
    cache_hit_rate: rate(rows.filter(r => r.decision === "resolved_from_cache").length, n),
    llm_hint_pool_hit_rate: rate(llmRows.filter(r => r.llm_canonical_was_in_hint_pool === true).length, llmRows.length),
    llm_true_miss_rate: rate(llmRows.filter(r => r.llm_canonical_was_in_hint_pool === false).length, llmRows.length),
    double_check_remap_rate: rate(rows.filter(r => r.double_check_changed).length, resolved.length),
    form_retention_rate: rate(rows.filter(r => r.form_retention_overrode).length, resolved.length),
    variety_retention_rate: rate(rows.filter(r => r.variety_retention_overrode).length, resolved.length),
    semantic_dedup_rate: rate(rows.filter(r => r.semantic_dedup_changed).length, resolved.length),
    failure_rate: rate(rows.filter(r => r.decision === "failed").length, n),
    probation_rate: rate(rows.filter(r => r.decision === "probation").length, n),
    p50_latency_ms: p50 != null ? String(p50) : null,
    p95_latency_ms: p95 != null ? String(p95) : null,
    data_from: rows.at(-1)?.created_at ?? null,
    data_to: rows[0]?.created_at ?? null,
  }
}

type IWRL = { items_claimed: number | null; started_at: string }

async function queryWorkerRunLogDirect(): Promise<RunRow> {
  const cutoff = new Date(Date.now() - DAYS * 86400_000).toISOString()
  const rows = await fetchAll<IWRL>(
    "ingredient_worker_run_log",
    `started_at=gte.${cutoff}`
  )
  const totalClaimed = rows.reduce((s, r) => s + (r.items_claimed ?? 0), 0)
  return { total_runs: String(rows.length), total_claimed: String(totalClaimed) }
}

type IQHS = {
  pending_count: number
  resolved_last_24h: number
  p95_queue_wait_seconds: number | null
  snapshotted_at: string
}

async function queryQueueHealthDirect(): Promise<HealthRow> {
  const cutoff = new Date(Date.now() - DAYS * 86400_000).toISOString()
  const rows = await fetchAll<IQHS>(
    "ingredient_queue_health_snapshots",
    `snapshotted_at=gte.${cutoff}&order=snapshotted_at.desc`
  )
  if (!rows.length) return { avg_pending: null, avg_resolved_24h: null, avg_p95_wait_secs: null, latest_pending: null }

  const avg = (vals: (number | null)[]) => {
    const finite = vals.filter((v): v is number => v != null)
    return finite.length ? String(Math.round(finite.reduce((s, v) => s + v, 0) / finite.length)) : null
  }

  return {
    avg_pending: avg(rows.map(r => r.pending_count)),
    avg_resolved_24h: avg(rows.map(r => r.resolved_last_24h)),
    avg_p95_wait_secs: avg(rows.map(r => r.p95_queue_wait_seconds)),
    latest_pending: String(rows[0]!.pending_count),
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
