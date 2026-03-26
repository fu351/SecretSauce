# Ingredient Worker

Background worker for `ingredient_match_queue`.

## Overview

This worker claims pending ingredient queue rows, standardizes ingredient names, optionally resolves units, and writes the result back to the database. It also applies the worker-side safety and quality layers used by the queue pipeline:

- local in-memory caches for AI and probation lookups
- confidence calibration
- learned sensitive-token retention
- vector fast-path and semantic dedup
- canonical double-checks and new-canonical risk guards
- packaged-item unit fallback for scraper rows

## Key Files

- `runner.ts` - long-running worker loop; calls the processor once per cycle and sleeps between cycles.
- `processor.ts` - main queue resolver; claims rows, runs ingredient/unit standardization, applies safety checks, and persists results.
- `batching.ts` - chunking and bounded concurrency helpers.
- `unit-resolution-utils.ts` - unit heuristics and packaged-item fallback logic.
- `canonical/double-check.ts` - remap validation against existing canonicals.
- `canonical/risk.ts` - new-canonical blocking and fallback recovery.
- `canonical/token-idf.ts` - IDF-based confidence floor for new canonicals.
- `canonical/tokens.ts` - canonical token normalization helpers.
- `scoring/vector-match.ts` - embedding-based candidate rerank and semantic dedup.
- `scoring/confidence-calibration.ts` - confidence calibration from queue telemetry.
- `scoring/sensitive-token-learning.ts` - learns modifiers that should be preserved for certain heads.
- `cache/*.ts` - in-memory refresh/cache helpers.
- `__tests__/*.test.ts` - worker unit tests.

## Run

From the repo root:

- One-shot queue run: `npm run resolve-ingredient-match-queue`
- Continuous loop: `npm run queue-worker`

The worker script is wired through the repo scripts package, and the Fly worker process also uses `npm --prefix scripts run queue-worker`.

## Required Env

The worker depends on the shared Supabase worker client and the standardizer/OpenAI path.

Required for normal runs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Common optional knobs:

- `OPENAI_MODEL` - chat model used by ingredient/unit standardizers; defaults to `gpt-4o-mini`
- `EMBEDDING_OPENAI_MODEL` - embedding model used by vector matching; defaults to `text-embedding-3-small`
- `QUEUE_MAX_CYCLES` - stop after N cycles when running one-shot or bounded loops; default `0` means unlimited loop mode
- `QUEUE_RESOLVER_NAME` - resolver label written to queue rows; default `queue-worker`
- `QUEUE_BATCH_LIMIT` - rows fetched per cycle; default `25`
- `QUEUE_CHUNK_SIZE` - chunk size within a cycle; default `10`
- `QUEUE_CHUNK_CONCURRENCY` - concurrent chunk workers; default `1`
- `QUEUE_LEASE_SECONDS` - processing lease duration; default `180`
- `WORKER_INTERVAL_SECONDS` - sleep between loop cycles; default `300`
- `QUEUE_STANDARDIZER_CONTEXT` - `recipe`, `pantry`, or `dynamic`
- `QUEUE_REVIEW_MODE` - `ingredient`, `unit`, or `any`
- `QUEUE_SOURCE` - `scraper`, `recipe`, or `any`; default `scraper`
- `DRY_RUN` - logs decisions without writing queue updates
- `QUEUE_ENABLE_UNIT_RESOLUTION` - enables unit processing; default `true`
- `QUEUE_UNIT_DRY_RUN` - run unit logic without writing unit results
- `QUEUE_UNIT_MIN_CONFIDENCE` - minimum acceptable unit confidence; default `0.75`
- `QUEUE_LOCAL_CACHE_MAX_ENTRIES` - cap for the in-memory AI cache; default `50000`

## Processing Flow

1. Load `QueueWorkerConfig` from env.
2. Loop: requeue expired leases, then claim or fetch pending rows based on `DRY_RUN`.
3. Split rows into chunks and process chunks with bounded concurrency.
4. Resolve units first:
   - scraper rows with no explicit unit signals use the packaged fallback
   - otherwise the worker calls the unit standardizer and may fall back after a failure
5. Resolve ingredients:
   - normalize and dedupe search terms
   - reuse local AI cache when possible
   - try vector fast-path for high-confidence matches
   - augment remaining LLM calls with vector hints
   - standardize ingredients with AI
6. Apply canonical safeguards before writes:
   - preserve important form/variety tokens when needed
   - calibrate confidence
   - remap through canonical double-check when allowed
   - block risky new canonicals and use fallback recovery when possible
   - enforce probation for newly created canonicals
7. Persist queue status updates and telemetry.

## Outputs

Successful runs update:

- `ingredient_match_queue` rows via `markResolved`, `markIngredientResolvedPendingUnit`, `markFailed`, or `markProbation`
- `standardized_ingredients` for newly created canonicals
- confidence telemetry and canonical double-check telemetry in the queue database

The worker also logs per-cycle summaries to stdout, including resolved/failed counts and unit metrics.

## Testing

Run the worker tests with Vitest:

- `npm run test:run -- workers/ingredient-worker/__tests__`

Relevant test coverage lives in:

- `__tests__/batching.test.ts`
- `__tests__/double-check.test.ts`
- `__tests__/refreshing-cache.test.ts`
- `__tests__/unit-resolution-utils.test.ts`
