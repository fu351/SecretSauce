# Vector Double-Check Worker

Scans `ingredient_embeddings` for canonical pairs with high cosine similarity, then logs discovered pairs to `canonical_double_check_daily_stats` for downstream review and consolidation.

## Key Files

- `config.ts` - reads worker config from environment variables.
- `processor.ts` - fetches candidates, resolves remap direction, and writes stats rows.
- `runner.ts` - long-running loop wrapper around the processor.
- `resolve-vector-double-check.ts` - one-shot entrypoint for local runs and compose.
- `__tests__/processor.test.ts` - behavior coverage for dry-run, logging, and cycle limits.

## Run

- Local one-shot:
  - `tsx --env-file=.env.local backend/workers/vector-double-check-worker/resolve-vector-double-check.ts`
- Repo loop:
  - `npm run vector-double-check-worker`
- Shared scripts package entrypoint:
  - `npm --prefix scripts run resolve-vector-double-check`
- Local Docker service:
  - `docker compose -f docker-compose.local.yml run --rm vector-double-check-worker`

The local compose service sets `EMBEDDING_OPENAI_MODEL=nomic-embed-text`, `VECTOR_DC_DRY_RUN=false`, and `VECTOR_DC_SIMILARITY_THRESHOLD=0.9`.

## Required Env Vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The worker also uses these optional settings:

- `VECTOR_DC_BATCH_LIMIT` - default `100`
- `VECTOR_DC_MAX_CYCLES` - default `0` in config; the processor treats `0` as unlimited
- `VECTOR_DC_INTERVAL_SECONDS` - default `3600`
- `VECTOR_DC_SIMILARITY_THRESHOLD` - default `0.88`
- `VECTOR_DC_DRY_RUN` - default `false`
- `EMBEDDING_OPENAI_MODEL` - default `text-embedding-3-small`

## Processing Flow

1. Load config from env.
2. Call `fn_find_vector_double_check_candidates` through `ingredientEmbeddingsDB`.
3. If `VECTOR_DC_DRY_RUN=true`, print candidates and skip all DB writes.
4. Otherwise resolve direction with `resolveRemapDirection`:
   - `generic_to_specific` pairs are logged as skipped so they do not resurface.
   - `lateral` pairs are reordered so the shorter canonical becomes `source_canonical`.
   - other pairs are logged to `canonical_double_check_daily_stats` with `reason=vector_candidate_discovery`.
5. Stop when a cycle returns fewer rows than `VECTOR_DC_BATCH_LIMIT`, then print a summary.

## Testing

- `npm run test:run -- backend/workers/vector-double-check-worker/__tests__/processor.test.ts`

The tests mock the database layer and cover dry-run mode, logging behavior, and `maxCycles`.
