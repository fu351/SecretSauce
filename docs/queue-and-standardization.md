# Queue and Standardization

Last verified: 2026-03-20.

## Ingredient queue worker

Core files:

- `queue/index.ts`
- `queue/config.ts`
- `queue/ingredient-worker/processor.ts`
- `queue/ingredient-worker/runner.ts`

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

- `queue/ingredient-worker/scoring/vector-match.ts`

The effective score combines cosine similarity with bonuses/penalties (head/lexical/category/form) and is used for fast-path and semantic dedup flows.

## Embedding queue worker

Core files:

- `queue/embedding-worker/config.ts`
- `queue/embedding-worker/processor.ts`
- `queue/embedding-worker/runner.ts`
- `scripts/resolve-embedding-queue.ts`

Responsibilities:

- Claims/requeues embedding queue rows.
- Fetches embeddings.
- Upserts into `recipe_embeddings` / `ingredient_embeddings`.
- Marks queue rows completed/failed.

## Vector double-check candidate discovery

Present in repository:

- `queue/vector-double-check-worker/config.ts`
- `queue/vector-double-check-worker/processor.ts`
- `queue/vector-double-check-worker/runner.ts`

Purpose:

- Discovers high-similarity canonical pairs not yet logged in daily double-check stats.
- Logs candidates for manual/review pipeline visibility.

Note:

- This worker is present in the tree but not currently exposed in top-level `package.json` scripts.

## Standardizer modules

Core files:

- `standardizer/ingredient-standardizer.ts`
- `standardizer/unit-standardizer.ts`
- `standardizer/prompts/ingredient/*`
- `standardizer/prompts/unit/*`

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
- Backfill embedding queue:
  - `npm run backfill-embedding-queue`

## Migration alignment

Queue/scoring docs are aligned to current migrations in `supabase/migrations/*`, including:

- queue probation status
- canonical creation probation/confidence outcomes
- token IDF cache and bigram/PPMI collocation wiring
- product mapping `is_ingredient` sync

