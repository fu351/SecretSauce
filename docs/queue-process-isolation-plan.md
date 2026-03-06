# Queue Process Isolation Plan

## Agent Metadata

- `Doc Kind`: `design-plan`
- `Canonicality`: `advisory`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-03-06`
- `Primary Surfaces`: `queue/worker/*`, `scripts/resolve-ingredient-match-queue.ts`, `supabase/migrations/public.sql`, `lib/database/supabase.ts`, `docs/embedding-queue-worker-operations-guide.md`

## Objective

Isolate the two queue processes so they can run, scale, deploy, and fail independently:

1. Ingredient Match Resolution (`ingredient_match_queue`)
2. Embedding Generation (`embedding_queue` + `recipe_embeddings` + `ingredient_embeddings`)

## Current State (Observed)

- Ingredient queue is implemented and runnable through `queue/worker/*` and `resolve-ingredient-match-queue`.
- Embedding tables exist in schema snapshot (`public.sql`), but embedding worker runtime and scripts are not present.
- Queue runtime naming is currently ingredient-centric and should remain that way for Process 1.
- Process 2 should be introduced as a separate runtime, not an extension of existing ingredient worker internals.

## Target Architecture

### Process 1: Ingredient Match Resolution

- Runtime:
  - `queue/worker/processor.ts`
  - `queue/worker/runner.ts`
  - `scripts/resolve-ingredient-match-queue.ts`
- Queue contract:
  - `ingredient_match_queue`
  - `claim_ingredient_match_queue(...)`
  - `requeue_expired_ingredient_match_queue(...)`
- Ownership:
  - Canonical ingredient/unit resolution only.

### Process 2: Embedding Generation

- Runtime (new, separate tree):
  - `queue/embedding-worker/config.ts`
  - `queue/embedding-worker/processor.ts`
  - `queue/embedding-worker/runner.ts`
  - `scripts/resolve-embedding-queue.ts`
  - `scripts/backfill-embedding-queue.ts`
- Queue contract:
  - `embedding_queue`
  - `claim_embedding_queue(...)`
  - `requeue_expired_embedding_queue(...)`
  - Writes to `recipe_embeddings` and `ingredient_embeddings`
- Ownership:
  - Embedding claim/embed/persist lifecycle only.

## Isolation Rules

- No shared processor modules between Process 1 and Process 2.
- Separate env var namespaces:
  - Process 1: `QUEUE_*`
  - Process 2: `EMBEDDING_QUEUE_*` and `EMBEDDING_WORKER_*`
- Separate npm scripts and deploy targets.
- Separate runbooks and failure playbooks.
- No cross-process claim/requeue calls.

## Implementation Plan

### Phase 1: Contract Verification and DB Readiness

1. Confirm DB objects for Process 2 are present in applied migrations (not only schema snapshot):
   - tables: `embedding_queue`, `recipe_embeddings`, `ingredient_embeddings`
   - RPCs: `claim_embedding_queue`, `requeue_expired_embedding_queue`
2. Add/confirm indexes for embedding queue claim path:
   - `(status, processing_lease_expires_at, created_at)`
   - `(source_type, source_id)`
3. Add/confirm idempotency strategy for backfill writes:
   - preferred: unique key on `(source_type, source_id)`
   - fallback: deterministic upsert logic in script

Acceptance criteria:

- Embedding queue claims and requeues can execute safely under concurrent workers.
- Backfill can be rerun without unbounded duplicate queue rows.

### Phase 2: Separate Runtime for Process 2

1. Add embedding-only DB wrapper (`lib/database/embedding-queue-db.ts`).
2. Add embedding worker config with dedicated env names.
3. Implement one-cycle processor:
   - requeue expired
   - claim pending
   - generate embeddings
   - upsert vector rows
   - mark completed/failed
4. Add continuous runner.
5. Add one-shot resolver script.

Acceptance criteria:

- Process 2 runs end-to-end without importing ingredient queue processor logic.
- Process 1 behavior remains unchanged.

### Phase 3: Backfill and Operations

1. Add `backfill-embedding-queue` script for recipes and standardized ingredients.
2. Add npm scripts:
   - `resolve-embedding-queue`
   - `embedding-queue-worker`
   - `backfill-embedding-queue`
3. Add operational runbook section for Process 2.

Acceptance criteria:

- Fresh environment can seed and drain embedding queue independently.
- Process 1 can be stopped/restarted with zero impact on Process 2, and vice versa.

### Phase 4: Guardrails and Observability

1. Add process-specific logs and counters:
   - claimed/completed/failed/requeued per cycle
2. Add alert conditions per process:
   - sustained queue depth
   - growing failed ratio
   - stale processing leases
3. Validate failure isolation by simulation:
   - force Process 2 provider errors and verify Process 1 continues normally.

Acceptance criteria:

- Operational dashboards and alerts are process-specific.
- Incident in one process does not page/runbook-hop the other by default.

## Migration and Rollout Sequence

1. Ship DB contract/index updates for embedding queue.
2. Deploy Process 2 code paths behind separate scripts/worker process.
3. Run small backfill sample and one-shot resolver.
4. Enable continuous embedding worker.
5. Monitor for 24h.
6. Scale Process 1 and Process 2 independently based on queue depth.

## Risks and Mitigations

- Risk: queue duplication during backfill.
  - Mitigation: unique `(source_type, source_id)` or deterministic update-before-insert.
- Risk: accidental coupling via shared env vars.
  - Mitigation: strict env namespace split and config validation.
- Risk: worker confusion in deployment.
  - Mitigation: separate process names, scripts, and runbooks.

## Non-Goals

- Merging Process 1 and Process 2 into a single generalized queue worker.
- Adding semantic retrieval APIs in this phase.
- Refactoring ingredient resolution logic outside isolation concerns.

## Checklist

- [ ] Verify embedding queue DB contracts are migration-backed.
- [ ] Define idempotent enqueue strategy for `embedding_queue`.
- [ ] Implement isolated embedding worker runtime tree.
- [ ] Add isolated scripts and package commands.
- [ ] Add process-specific operational docs and alerts.
- [ ] Validate failure isolation in staging.
