# Canonical Consolidation Worker

This worker turns high-confidence canonical double-check results into actual canonical merges. It reads candidate pairs from `canonical_double_check_daily_stats`, decides which canonical survives, calls the consolidation RPC, and logs the merge for audit.

## Key Files

- `backend/orchestrators/canonical-consolidation-pipeline/pipeline.ts` - one-shot pipeline entrypoint used for local runs and compose.
- `backend/workers/canonical-consolidation-worker/config.ts` - reads runtime config from env.
- `backend/workers/canonical-consolidation-worker/processor.ts` - fetches candidates, applies guards, performs merges, and writes logs.
- `backend/workers/canonical-consolidation-worker/guards.ts` - rejects risky candidates before merge.
- `backend/workers/canonical-consolidation-worker/survivor.ts` - chooses the survivor vs loser canonical.
- `lib/database/canonical-consolidation-db.ts` - Supabase access for fetch/merge/log operations.
- `backend/workers/canonical-consolidation-worker/__tests__/guards.test.ts` - guard coverage.

## Run

One-shot:

```bash
tsx --env-file=.env.local backend/orchestrators/canonical-consolidation-pipeline/pipeline.ts
```

Shared scripts package entrypoint:

```bash
npm --prefix backend/scripts run canonical-consolidation-pipeline
```

Docker Compose:

```bash
docker compose -f docker-compose.local.yml run --rm canonical-consolidation-worker
```

By default the worker runs in dry-run mode. To apply merges, set `CONSOLIDATION_DRY_RUN=false`.

## Required Env Vars

Required for any run:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Worker config env vars:

- `CONSOLIDATION_BATCH_LIMIT` - batch size per cycle, default `50`
- `CONSOLIDATION_MAX_CYCLES` - number of cycles for the loop runner, default `0` meaning unlimited in `runner.ts`
- `CONSOLIDATION_INTERVAL_SECONDS` - sleep between cycles in the loop runner, default `86400`
- `CONSOLIDATION_MIN_SIMILARITY` - minimum `max_similarity`, default `0.92`
- `CONSOLIDATION_MIN_EVENT_COUNT` - minimum `event_count`, default `2`
- `CONSOLIDATION_DRY_RUN` - default `true`
- `CONSOLIDATION_WORKER_NAME` - audit label, default `canonical-consolidation-worker`
- `CONSOLIDATION_ENABLE_CLUSTER_PLANNING` - when `true`, derive lateral merge intents from token-coherent candidate communities before applying the pairwise worker rules; default `true`

Note: `docker-compose.local.yml` overrides some defaults for local execution, including `CONSOLIDATION_MIN_EVENT_COUNT=1`.

## Processing Flow

1. Load config from env.
2. Query `canonical_double_check_daily_stats` for rows from the last year with:
   - `decision = skipped`
   - `reason = vector_candidate_discovery`
   - `direction = lateral`
   - `event_count >= minEventCount`
   - `max_similarity >= minSimilarity`
3. Reject candidates that fail guard rules:
   - cross-category pairs
   - non-`lateral` pairs
   - empty canonicals
   - non-trivial lateral variants
4. Pick the survivor:
   - cluster-planned rows keep the cluster-selected target, but still must pass the normal guard rules
   - other `lateral` rows prefer higher product count, then shorter name, then lexicographic tie-break
5. If `CONSOLIDATION_DRY_RUN=true`, log the intended merge and skip the RPC call.
6. Otherwise call `fn_consolidate_canonical` to remap downstream references and delete the loser canonical.
7. Write a row to `canonical_consolidation_log`, then log the remap through `fn_log_canonical_double_check_daily` with decision `remapped`. If either audit write fails, the worker records the merge as failed instead of silently treating it as complete.

## Testing

Run the worker tests:

```bash
vitest run backend/workers/canonical-consolidation-worker/__tests__/guards.test.ts
```

Or run the full test suite:

```bash
npm test
```
