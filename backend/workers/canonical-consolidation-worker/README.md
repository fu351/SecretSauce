# Canonical Consolidation Worker

This worker turns high-confidence canonical double-check results into actual canonical merges. It reads candidate pairs from `canonical_double_check_daily_stats`, decides which canonical survives, calls the consolidation RPC, and logs the merge for audit.

## Key Files

- `resolve-canonical-consolidation.ts` - one-shot entrypoint used for local runs and compose.
- `backend/workers/canonical-consolidation-worker/config.ts` - reads runtime config from env.
- `backend/workers/canonical-consolidation-worker/processor.ts` - fetches candidates, applies guards, performs merges, and writes logs.
- `backend/workers/canonical-consolidation-worker/guards.ts` - rejects risky candidates before merge.
- `backend/workers/canonical-consolidation-worker/survivor.ts` - chooses the survivor vs loser canonical.
- `lib/database/canonical-consolidation-db.ts` - Supabase access for fetch/merge/log operations.
- `backend/workers/canonical-consolidation-worker/__tests__/guards.test.ts` - guard coverage.

## Run

One-shot:

```bash
tsx --env-file=.env.local backend/workers/canonical-consolidation-worker/resolve-canonical-consolidation.ts
```

Shared scripts package entrypoint:

```bash
npm --prefix scripts run resolve-canonical-consolidation
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

Note: `docker-compose.local.yml` overrides some defaults for local execution, including `CONSOLIDATION_MIN_EVENT_COUNT=1`.

## Processing Flow

1. Load config from env.
2. Query `canonical_double_check_daily_stats` for rows from the last year with:
   - `decision = skipped`
   - `reason = vector_candidate_discovery`
   - `direction in ('lateral', 'specific_to_generic')`
   - `event_count >= minEventCount`
   - `max_similarity >= minSimilarity`
3. Reject candidates that fail guard rules:
   - cross-category pairs
   - non-`lateral` pairs
   - empty canonicals
   - non-trivial lateral variants
4. Pick the survivor:
   - `specific_to_generic` -> target survives
   - `lateral` -> shorter name survives, with lexicographic tie-break
5. If `CONSOLIDATION_DRY_RUN=true`, log the intended merge and skip the RPC call.
6. Otherwise call `fn_consolidate_canonical` to remap downstream references and delete the loser canonical.
7. Write a row to `canonical_consolidation_log`, then log the remap through `fn_log_canonical_double_check_daily` with decision `remapped`.

## Testing

Run the worker tests:

```bash
vitest run backend/workers/canonical-consolidation-worker/__tests__/guards.test.ts
```

Or run the full test suite:

```bash
npm test
```
