# Queue and Standardization

Last verified: 2026-03-26.

## Ingredient queue worker

Core files:

- `backend/workers/index.ts`
- `backend/workers/config.ts`
- `backend/scripts/resolve-ingredient-match-queue.ts`
- `backend/scripts/package.json`
- `backend/workers/ingredient-worker/processor.ts`
- `backend/workers/ingredient-worker/runner.ts`

### Responsibilities

- Claims pending queue rows with lease semantics.
- Runs ingredient standardization and optional unit resolution.
- Applies canonical safety policies:
  - probation rules
  - invalid canonical blocking
  - remap double-checks
- Applies scoring enhancements:
  - confidence calibration
  - learned sensitivity modifiers
  - vector match fast-path + semantic dedup
- Persists queue outcomes and logs confidence outcomes/double-check stats.

### Matching/scoring notes

Vector matching policy is implemented in:

- `backend/workers/ingredient-worker/scoring/vector-match.ts`

The effective score combines cosine similarity with bonuses/penalties (head/lexical/category/form) and is used for fast-path and semantic dedup flows.

## Embedding queue worker

Core files:

- `backend/workers/embedding-worker/config.ts`
- `backend/workers/embedding-worker/embedding-queue-db.ts`
- `backend/workers/embedding-worker/openai-embeddings.ts`
- `backend/workers/embedding-worker/ollama-embeddings.ts`
- `backend/workers/embedding-worker/processor.ts`
- `backend/workers/embedding-worker/runner.ts`
- `backend/scripts/resolve-embedding-queue.ts`
- `backend/scripts/package.json`

Responsibilities:

- Claims/requeues embedding queue rows.
- Fetches embeddings via OpenAI or Ollama (controlled by `EMBEDDING_PROVIDER`).
- Upserts into `recipe_embeddings` / `ingredient_embeddings`.
- Marks queue rows completed/failed.

Embedding provider:

- `EMBEDDING_PROVIDER=openai` (default): uses `text-embedding-3-small`.
- `EMBEDDING_PROVIDER=ollama`: uses `nomic-embed-text` by default.
- `OLLAMA_BASE_URL` defaults to `http://localhost:11434`.

The worker uses `EMBEDDING_OPENAI_MODEL` as the model selector for both providers, so check the embedding schema/migrations before changing provider defaults.

## Vector double-check candidate discovery

Core files:

- `backend/workers/vector-double-check-worker/config.ts`
- `backend/workers/vector-double-check-worker/processor.ts`
- `backend/workers/vector-double-check-worker/runner.ts`
- `backend/workers/vector-double-check-worker/resolve-vector-double-check.ts`

Purpose:

- Scans `ingredient_embeddings` for canonical pairs with cosine similarity ≥ `VECTOR_DC_SIMILARITY_THRESHOLD` (default 0.9) that haven't been logged yet.
- Logs `lateral` and `specific_to_generic` pairs to `canonical_double_check_daily_stats` for downstream consolidation.
- Filters out `generic_to_specific` pairs (logs them as skipped so they don't re-surface).
- For `lateral` pairs, always records the shorter name as `source_canonical`.

Run via `docker compose -f docker-compose.local.yml run --rm vector-double-check-worker`.

## Canonical consolidation worker

Core files:

- `backend/workers/canonical-consolidation-worker/config.ts`
- `backend/workers/canonical-consolidation-worker/processor.ts`
- `backend/workers/canonical-consolidation-worker/runner.ts`
- `backend/workers/canonical-consolidation-worker/survivor.ts`
- `backend/workers/canonical-consolidation-worker/resolve-canonical-consolidation.ts`
- `lib/database/canonical-consolidation-db.ts`

Purpose:

- Reads high-similarity `lateral` and `specific_to_generic` pairs from `canonical_double_check_daily_stats`.
- Selects the survivor canonical (`lateral` → shorter name; `specific_to_generic` → the generic).
- Calls `fn_consolidate_canonical` to atomically re-point all downstream references and delete the loser canonical.
- Logs each merge to `canonical_consolidation_log` for audit.

Key config:

- `CONSOLIDATION_DRY_RUN` (default `true`) — set to `false` to apply merges.
- `CONSOLIDATION_MIN_SIMILARITY` (default `0.92`) — minimum `max_similarity` from stats.
- `CONSOLIDATION_MIN_EVENT_COUNT` (default `1`).

Note: uses a service-role Supabase client (`lib/database/supabase-worker.ts`) to bypass RLS on `canonical_double_check_daily_stats`.

## Standardizer modules

Core files:

- `backend/workers/standardizer-worker/ingredient-standardizer.ts`
- `backend/workers/standardizer-worker/unit-standardizer.ts`
- `backend/workers/standardizer-worker/prompts/ingredient/*`
- `backend/workers/standardizer-worker/prompts/unit/*`

Key points:

- Ingredient standardizer supports context-specific behavior (`recipe` vs `pantry`).
- Unit standardizer normalizes unit labels and supports heuristic fallback.
- API route `POST /api/ingredients/standardize` is currently pantry-context only.

## Operational entry points

- One-shot ingredient queue run:
  - `npm run resolve-ingredient-match-queue`
- Continuous ingredient queue loop:
  - `npm run queue-worker`
- One-shot embedding queue run:
  - `npm run resolve-embedding-queue`
- Continuous embedding queue loop:
  - `npm run embedding-queue-worker`
- Continuous vector double-check loop:
  - `npm run vector-double-check-worker`
- One-shot vector double-check run:
  - `npm --prefix scripts run resolve-vector-double-check`
- One-shot canonical consolidation run:
  - `npm --prefix scripts run resolve-canonical-consolidation`
- Backfill embedding queue:
  - `npm run backfill-embedding-queue`

## Migration alignment

Queue/scoring docs are aligned to current migrations in `supabase/migrations/*`, including:

- queue probation status
- canonical creation probation/confidence outcomes
- token IDF cache and bigram/PPMI collocation wiring
- product mapping `is_ingredient` sync
- `fn_find_vector_double_check_candidates` — vector similarity scan with 5-min statement timeout
- `fn_consolidate_canonical` — atomic canonical merge across all downstream tables
- `canonical_consolidation_log` — audit table for consolidation events
