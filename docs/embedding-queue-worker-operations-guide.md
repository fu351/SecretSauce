# Embedding Queue Worker Operations Guide

## Agent Metadata

- `Doc Kind`: `operations-guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-03-20`
- `Primary Surfaces`: `supabase/migrations/embedding_queue.sql`, `supabase/migrations/recipe_embeddings.sql`, `supabase/migrations/ingredient_embeddings.sql`, `lib/database/embedding-queue-db.ts`, `queue/embedding-worker/`
- `Update Trigger`: Queue schema/RPC contract, worker lifecycle, or embedding provider settings change.

## Agent Use

- `Read this when`: implementing or operating the embedding queue worker pipeline.
- `Stop reading when`: you are working on semantic retrieval/query APIs (use a dedicated search/RAG design doc).
- `Escalate to`: `docs/database-guide.md` and `docs/queue-processing.md` for DB contract and queue concurrency rules.

## Purpose

Provide a step-by-step implementation and operations guide for the embedding queue worker that processes both recipes and standardized ingredients.

## Scope

In scope:

- Worker-side processing for `embedding_queue`.
- OpenAI embedding generation and persistence.
- Queue lifecycle handling (`pending` -> `processing` -> `completed`/`failed`).
- Backfill process for already-existing recipes and standardized ingredients.

Out of scope:

- Semantic search RPC integration.
- RAG query integration.
- UI-level retrieval features.

## Assumptions

The following are already implemented in Supabase:

- Tables:
  - `public.embedding_queue`
  - `public.recipe_embeddings`
  - `public.ingredient_embeddings`
- RPCs:
  - `public.claim_embedding_queue(...)`
  - `public.requeue_expired_embedding_queue(...)`
- Triggers that enqueue rows for:
  - recipe inserts/updates
  - standardized ingredient inserts/updates

## Component Overview

1. `lib/database/supabase.ts` (types)
   - Adds typed table and RPC contracts so worker code compiles safely.
2. `lib/database/embedding-queue-db.ts`
   - Encapsulates all queue lifecycle transitions and embedding upserts.
3. `queue/embedding-worker/config.ts`
   - Reads and validates environment-driven runtime settings.
4. `queue/embedding-worker/processor.ts`
   - Executes one processing cycle (requeue, claim, embed, persist, finalize).
5. `queue/embedding-worker/runner.ts`
   - Runs the processor continuously on an interval.
6. `scripts/resolve-embedding-queue.ts`
   - One-shot executable for manual runs and CI jobs.
7. `scripts/backfill-embedding-queue.ts`
   - Idempotently seeds queue rows for existing records.

## Step-by-Step Build Plan

### Step 1: Add Supabase Type Contracts

Update `lib/database/supabase.ts` with:

- `Tables.embedding_queue`
- `Tables.recipe_embeddings`
- `Tables.ingredient_embeddings`
- `Functions.claim_embedding_queue`
- `Functions.requeue_expired_embedding_queue`

How it works:

- Worker methods become strongly typed for `source_type`, `status`, and payload fields.
- Compile-time checks prevent accidental wrong-table or wrong-RPC payload usage.

### Step 2: Build the Embedding Queue DB Wrapper

Create `lib/database/embedding-queue-db.ts` with methods:

- `claimPending(params)`
- `requeueExpired(params)`
- `markCompleted(rowId)`
- `markFailed(rowId, errorMessage)`
- `upsertRecipeEmbedding(params)`
- `upsertIngredientEmbedding(params)`

How it works:

- Worker code only calls one DB abstraction.
- Queue transitions are centralized and consistent across one-shot and loop modes.
- Upserts are idempotent using unique keys (`recipe_id`, `standardized_ingredient_id`).

### Step 3: Add Worker Runtime Config

Create `queue/embedding-worker/config.ts` to read:

- `EMBEDDING_QUEUE_BATCH_LIMIT` (default `50`)
- `EMBEDDING_QUEUE_LEASE_SECONDS` (default `180`)
- `EMBEDDING_WORKER_INTERVAL_SECONDS` (default `300`)
- `EMBEDDING_QUEUE_MAX_CYCLES` (default `0` for loop-until-empty or runner-controlled)
- `EMBEDDING_QUEUE_REQUEUE_LIMIT` (default `500`) — max rows unlocked per requeue pass
- `EMBEDDING_OPENAI_MODEL` (default `text-embedding-3-small`)
- `EMBEDDING_WORKER_REQUEST_TIMEOUT_MS` (default `30000`) — OpenAI API call timeout
- `EMBEDDING_WORKER_SOURCE_TYPE` (optional filter: `recipe`, `ingredient`, `any`)
- `EMBEDDING_DRY_RUN` (`true/false`) — fetch and log pending rows without claiming or writing

How it works:

- All behavior can be tuned without code edits.
- Config parser applies safe defaults and basic validation.
- Dry-run mode is useful for verifying queue state before a rollout or debugging stale leases without side effects.

### Step 4: Add Embedding Provider Client Logic

In `queue/embedding-worker/processor.ts`, implement an OpenAI embeddings call utility:

- Input: `input_text[]`
- Output: `embedding[]` arrays aligned to input order
- Model: `EMBEDDING_OPENAI_MODEL`

How it works:

- Claimed rows are converted to API inputs in deterministic order.
- Response vectors are mapped back to queue row IDs.
- Any provider error is captured and converted into row-level failure handling.

### Step 5: Implement One Processing Cycle

Core processor flow for each cycle:

1. Call `requeue_expired_embedding_queue()` to unlock abandoned leases.
2. Call `claim_embedding_queue(batchLimit, leaseSeconds, sourceTypeFilter)`.
3. If no rows claimed, exit cycle with no-op summary.
4. Call OpenAI embeddings API for claimed rows.
5. For each row:
   - if `source_type = 'recipe'`: upsert `recipe_embeddings`
   - if `source_type = 'ingredient'`: upsert `ingredient_embeddings`
6. Mark successful rows as `completed`.
7. Mark failed rows as `failed` with `last_error`.

How it works:

- Claiming remains race-safe via DB-side `FOR UPDATE SKIP LOCKED`.
- Partial failures do not block successful rows in the same batch.
- Re-running the worker is safe due to upsert semantics.

### Step 6: Implement Continuous Runner

Create `queue/embedding-worker/runner.ts`:

- Runs processor in a `while (true)` loop.
- Sleeps `EMBEDDING_WORKER_INTERVAL_SECONDS` between cycles.
- Catches top-level errors, logs, and continues next interval.

How it works:

- Long-lived worker can run in Fly/GitHub Actions/cron.
- Single-cycle failures do not terminate the whole service.

### Step 7: Add One-Shot Entrypoint

Create `scripts/resolve-embedding-queue.ts`:

- Loads env via `dotenv/config`.
- Calls processor with `maxCycles` override for a bounded run.
- Exits non-zero on unhandled errors.

How it works:

- Used for manual debugging, CI smoke checks, and ad-hoc replay.

### Step 8: Add Backfill Script

Create `scripts/backfill-embedding-queue.ts`:

- Scans active `recipes` and `standardized_ingredients`.
- Builds `input_text` from canonical fields.
- Upserts into `embedding_queue` with status `pending`.

How it works:

- Existing records get scheduled for embedding without duplicate queue rows.
- Script can be rerun safely during staged rollout.

### Step 9: Add NPM Scripts

Add to `package.json`:

- `resolve-embedding-queue`: one-shot run
- `embedding-queue-worker`: continuous runner
- `backfill-embedding-queue`: queue seed/backfill

How it works:

- Standardized commands for local runs and automation jobs.

### Step 10: Validate and Roll Out

Validation sequence:

1. Run `backfill-embedding-queue`.
2. Run `resolve-embedding-queue` with small batch.
3. Confirm:
   - queue rows transition to `completed`/`failed`
   - vectors exist in correct embeddings table
   - `attempt_count` increments on retries
4. Enable continuous worker.
5. Monitor queue depth and failure rate for first 24 hours.

## Runtime Behavior by Component

### `embedding_queue`

- Source of truth for work scheduling.
- Lease metadata prevents duplicate processing across workers.

### `recipe_embeddings` and `ingredient_embeddings`

- Final storage for 1536-dimensional vectors.
- Upsert-by-entity key guarantees latest embedding replaces stale one.

### `embedding-queue-db.ts`

- Single place for queue state transitions and vector writes.
- Keeps processor logic small and testable.

### Worker Processor

- Stateless across cycles.
- Safe to run concurrently from multiple worker instances.

### Runner

- Handles repeated execution cadence.
- Keeps worker alive through transient failures.

### Backfill Script

- One-time bootstrap plus repeatable repair tool.
- Does not bypass queue semantics.

## Operational Checklist

Before first run:

1. Verify `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Confirm RPC execute grants include `service_role`.
3. Confirm embedding dimensions and model match (`1536` for `text-embedding-3-small`).

After deployment:

1. Track `pending` queue depth over time.
2. Track per-cycle claimed/completed/failed counts.
3. Alert if `failed` ratio spikes or `processing` rows age beyond lease window.

## Failure and Recovery Playbook

- Symptom: many `processing` rows stuck
  - Action: run one-shot worker; it should call `requeue_expired_embedding_queue()` first.
- Symptom: high `failed` rows with provider errors
  - Action: inspect `last_error`, reduce batch size, retry once provider stabilizes.
- Symptom: missing embeddings for existing rows
  - Action: rerun `backfill-embedding-queue`, then run one-shot processor.

## Deferred Work

The following remains intentionally postponed:

- Semantic search RPC usage from app APIs.
- RAG context retrieval/query composition.
