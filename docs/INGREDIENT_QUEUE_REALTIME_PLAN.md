# Ingredient Queue Real-Time Migration Plan

## Scope

This plan migrates the current nightly batch queue flow to a near-real-time queue worker, with local `Qwen3-8B` inference on a Framework Desktop (`64GB` config), and a throughput target of `50 ingredients every 5 minutes`.

## Goals and SLOs

- Throughput: sustain `>= 50 items / 5 min` (`>= 600/hour`).
- Latency: `p95` queue wait (created to processing start) under `5 minutes`.
- Reliability: failed item rate under `2%` excluding known invalid/non-food inputs.
- Safety: no duplicate processing for the same queue row while status is `processing`.

## Current State (Implemented)

Current runtime path:
- Workflow fallback driver: `.github/workflows/nightly-ingredient-queue.yml`
- Legacy shim entrypoint: `scripts/resolve-ingredient-match-queue.ts` (delegates to `queue/`)
- Queue runtime module: `queue/config.ts`, `queue/index.ts`, `queue/worker/processor.ts`, `queue/worker/batching.ts`, `queue/worker/runner.ts`
- Queue DB wrapper: `lib/database/ingredient-match-queue-db.ts`
- LLM normalizer: `lib/ingredient-standardizer.ts`

Current database integration:
- Additive queue migration prepared: `supabase/migrations/0011_queue_realtime_foundation.sql`
- Claim/requeue RPCs expected by worker:
  - `claim_ingredient_match_queue(p_limit, p_resolver, p_lease_seconds, p_review_mode, p_source)`
  - `requeue_expired_ingredient_match_queue(p_limit, p_error)`
- Queue row model now includes source-aware fields:
  - `source` (`scraper`/`recipe`)
  - `recipe_ingredient_id`
  - review flags + unit fields (`needs_ingredient_review`, `needs_unit_review`, `raw_unit`, `resolved_unit`, `resolved_quantity`)

Observed behavior in current implementation:
- Nightly workflow still runs in bounded batches and remains the rollout fallback.
- Worker uses atomic claim RPC when available and falls back to legacy fetch+mark if migration is not yet applied.
- Expired leases are requeued each cycle before claim.
- Chunk processing supports configurable concurrency (`QUEUE_CHUNK_CONCURRENCY`) and deduplicates identical names per batch.
- Worker defaults are source/review scoped for safety:
  - `QUEUE_SOURCE=scraper` (default)
  - `QUEUE_REVIEW_MODE=ingredient` (default)

## Target Architecture

1. Queue rows enter `ingredient_match_queue` in near real time.
2. A persistent local worker runs every few seconds (or continuously polling).
3. Worker atomically claims pending rows using a lease.
4. Worker batches by token budget (not fixed size only), optionally with controlled parallel chunk execution.
5. Worker calls local `Qwen3-8B` instruct endpoint.
6. Worker writes resolved/failed status and metrics.
7. Monitoring/alerts track queue depth, lag, failures, and stuck leases.

## Code Organization Change (`queue/` Directory)

Current structure:

```text
queue/
  config.ts
  index.ts
  worker/
    batching.ts
    processor.ts
    runner.ts
scripts/
  resolve-ingredient-match-queue.ts   # transitional shim/delegate during rollout
```

Planned additions (not implemented yet):

```text
queue/
  worker/
    lease.ts
  providers/
    local-llm.ts
    openai.ts
    gemini.ts
  metrics/
    queue-metrics.ts
```

Rationale:
- separates production worker runtime from one-off maintenance scripts
- improves testability and ownership boundaries
- makes local service deployment (launchd/systemd/container) cleaner

## Integration Steps

### Phase 0: Baseline and Guardrails

1. Add baseline instrumentation before changing behavior.
2. Capture current metrics for 3-7 days:
   - items queued/day
   - items resolved/day
   - p50/p95 queue age
   - failure reasons
3. Freeze acceptance criteria for cutover:
   - sustain `50 / 5 min` for `>= 24h`
   - zero duplicate claim incidents
   - no stuck processing rows past lease duration

### Phase 1: Local Qwen Service Integration

1. Stand up a local inference service exposing HTTP.
2. Prefer OpenAI-compatible request format to minimize app changes.
3. Add env configuration:
   - `LOCAL_LLM_ENABLED=true`
   - `LOCAL_LLM_BASE_URL=http://127.0.0.1:<port>/v1`
   - `LOCAL_LLM_MODEL=qwen3-8b-instruct`
   - `LOCAL_LLM_TIMEOUT_MS=20000`
   - `LOCAL_LLM_MAX_OUTPUT_TOKENS=1000`
4. Keep cloud fallback keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`) for rollback.

Files to touch:
- `lib/ingredient-standardizer.ts`
- `.env` (local only; no secrets committed)

### Phase 2: Provider Routing in Standardizer

1. Refactor provider selection in `lib/ingredient-standardizer.ts`:
   - `LOCAL_LLM` first when enabled
   - fallback to `OpenAI`
   - fallback to `Gemini`
   - fallback to deterministic local mapping
2. Add explicit model mode for instruct/non-thinking behavior.
3. Add per-provider latency and error counters in logs.
4. Keep response schema validation exactly as today.

Definition of done:
- Existing API route `app/api/ingredients/standardize/route.ts` works unchanged.
- Queue worker entrypoint can run with only local LLM env configured.

### Phase 3: Atomic Claiming and Lease Semantics

Status: Implemented in app code; DB migration apply pending.

1. Introduce DB-level claiming to remove fetch/mark race.
2. Add queue metadata columns (if missing):
   - `processing_started_at timestamptz`
   - `processing_lease_expires_at timestamptz`
   - `attempt_count integer default 0`
   - `last_error text`
3. Add RPC/function `claim_ingredient_match_queue(limit, resolver, lease_seconds, review_mode, source)`:
   - selects eligible rows (`pending` or expired lease)
   - marks them `processing`
   - sets lease timestamps and resolver
   - increments `attempt_count`
   - returns claimed rows in one transaction
4. Add helper function to requeue expired processing rows safely.
5. Update `lib/database/ingredient-match-queue-db.ts` to call RPC claim method.

Files to touch:
- `supabase/migrations/<new migration>.sql`
- `lib/database/ingredient-match-queue-db.ts`
- `queue/worker/processor.ts`

### Phase 4: Batching and Concurrency Optimization

Status: Partially implemented.

1. Replace fixed chunking (`10`) with adaptive chunking:
   - target token budget per request
   - max items guardrail
2. Add bounded parallel chunk processing:
   - start with concurrency `2`
   - tune up to `3-4` only if p95 latency and error rates stay healthy
3. Deduplicate same `cleaned_name` within claim batch to avoid repeated LLM work.
4. Add optional canonical result cache (`cleaned_name -> canonical_name`) to short-circuit repeats.

Files to touch:
- `queue/worker/processor.ts`
- `queue/worker/batching.ts`
- `lib/ingredient-standardizer.ts`
- optional new cache helper under `lib/`

### Phase 5: Runtime Orchestration (Every 5 Minutes)

Status: Partially implemented.

1. Create a persistent runner script:
   - `queue/worker/runner.ts`
2. Main loop:
   - every `5 minutes`, claim up to `50` items
   - process and commit
   - if backlog exceeds threshold, run additional immediate cycle
3. Add overlap protection:
   - DB advisory lock or singleton lock row
   - skip cycle if another active worker holds lock
4. Keep GitHub workflow as manual fallback during rollout.
5. Keep a temporary script shim so existing automation does not break:
   - `scripts/resolve-ingredient-match-queue.ts` delegates to `queue/index.ts`

Files to touch:
- new `queue/worker/runner.ts`
- new `queue/index.ts`
- `package.json` or `scripts/package.json` (new command pointing to `queue/worker/runner.ts`)
- temporary shim update in `scripts/resolve-ingredient-match-queue.ts`
- optionally `.github/workflows/nightly-ingredient-queue.yml` comments/deprecation note

### Phase 6: Observability and Alerting

1. Emit structured logs for:
   - claimed_count
   - resolved_count
   - failed_count
   - queue_lag_seconds (p50/p95)
   - llm_latency_ms (p50/p95)
2. Add health checks:
   - queue depth threshold
   - oldest pending age threshold
   - lease-expired row count
3. Optional: write run summaries to a metrics table for dashboarding.

Files to touch:
- `queue/worker/processor.ts`
- `queue/metrics/queue-metrics.ts`
- optional migration for metrics table

### Phase 7: Rollout and Cutover

1. Stage A (shadow):
   - run local worker with `DRY_RUN=true`
   - compare outputs against current nightly process
2. Stage B (partial):
   - enable real writes for one context (`pantry` or `recipe`)
   - nightly workflow remains enabled as safety net
3. Stage C (primary):
   - local worker handles all contexts
   - nightly job switched to backup/manual trigger
4. Stage D (cleanup):
   - remove redundant nightly queue logic when stable for 14 days

Rollback plan:
- Disable `LOCAL_LLM_ENABLED`
- Re-enable nightly queue workflow cadence
- Requeue `processing` rows with expired lease

## Detailed File-Level Change List

| File | Change |
|---|---|
| `lib/ingredient-standardizer.ts` | Add local provider client, provider routing, metrics logs, fallback order |
| `queue/worker/processor.ts` | Atomic claim usage, lease requeue integration, bounded concurrency, per-batch dedupe |
| `queue/worker/batching.ts` | Generic chunking and bounded concurrency helpers |
| `queue/worker/runner.ts` | Persistent scheduler loop (implemented, overlap protection pending) |
| `queue/index.ts` | Public queue worker entrypoint (implemented) |
| `queue/metrics/queue-metrics.ts` | Structured metrics/log emitters for queue runs |
| `lib/database/ingredient-match-queue-db.ts` | `claimPending` RPC wrapper (+ legacy fallback), lease-aware `requeueExpired`, source/review filtering |
| `scripts/resolve-ingredient-match-queue.ts` | Transitional shim delegating to new `queue/` entrypoint (implemented) |
| `package.json` and/or `scripts/package.json` | Add worker command pointing to `queue/worker/runner.ts` (implemented) |
| `supabase/migrations/0011_queue_realtime_foundation.sql` | Queue lease columns, claim/requeue RPCs, indexes, source/review-mode claim support |
| `.github/workflows/nightly-ingredient-queue.yml` | Fallback remains active; now source/review-mode aware for safe nightly draining |

## Proposed Configuration (Initial)

- `QUEUE_BATCH_LIMIT=50`
- `QUEUE_MAX_CYCLES=1` per scheduled cycle
- `QUEUE_BATCH_DELAY_SECONDS=0`
- `QUEUE_CHUNK_CONCURRENCY=2`
- `QUEUE_LEASE_SECONDS=180`
- `WORKER_INTERVAL_SECONDS=300`
- `LOCAL_LLM_TIMEOUT_MS=20000`

## Throughput Expectations

For Framework Desktop `64GB` with local `Qwen3-8B` instruct mode:
- Conservative initial target: `80-160 ingredients / 5 min`
- With adaptive batching + 2-way chunk concurrency: `160-320 / 5 min`

Target requirement (`50 / 5 min`) should fit with operational headroom if queue contention and DB bottlenecks are controlled.

## Testing Plan

1. Unit tests:
   - provider routing behavior
   - claim/reclaim logic
   - batching boundary logic (token budget and max batch)
2. Integration tests:
   - worker run with seeded queue rows
   - expired lease reprocessing
   - duplicate claim prevention under concurrent workers
3. Load tests:
   - 30-minute soak at `>= 50 / 5 min`
   - validate p95 queue lag and failure thresholds
4. Failure injection:
   - local LLM timeout
   - transient Supabase failures
   - forced process crash mid-cycle

## Open Decisions

1. Runtime host for local worker:
   - desktop service (`launchd`/systemd)
   - containerized local runner
2. Queue triggering model:
   - fixed 5-minute schedule only
   - hybrid schedule + immediate drain on backlog threshold
3. Cache location:
   - in-memory local cache only
   - persistent DB table cache

## Execution Checklist

- [ ] Baseline metrics captured
- [ ] Local LLM endpoint validated
- [ ] Provider routing merged
- [x] Queue runtime moved to `queue/` with shimmed legacy entrypoint
- [x] Atomic claim/requeue logic implemented in app code
- [ ] Atomic claim migration applied to database
- [x] Nightly workflow updated and preserved as fallback
- [ ] Worker runner deployed locally
- [ ] Observability dashboards/alerts active
- [ ] Stage A/B/C rollout complete
- [ ] Nightly workflow reduced to fallback/manual
