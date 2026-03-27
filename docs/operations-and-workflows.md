# Operations and Workflows

Last verified: 2026-03-26.

## Local operational commands

### Core app/test

- `npm run dev`
- `npm run build`
- `npm run test:run`
- `npm run test:api`
- `npm run e2e`

### Queue operations

- `npm run resolve-ingredient-match-queue`
- `npm run queue-worker`
- `npm run resolve-embedding-queue`
- `npm run embedding-queue-worker`
- `npm run vector-double-check-worker`
- `npm run backfill-embedding-queue`
- `npm --prefix scripts run resolve-vector-double-check`
- `npm --prefix scripts run resolve-canonical-consolidation`

### Script entrypoints

Root `package.json` exposes the common queue helpers:

- `resolve-ingredient-match-queue`
- `resolve-embedding-queue`
- `queue-worker`
- `embedding-queue-worker`
- `vector-double-check-worker`
- `backfill-embedding-queue`

`backend/scripts/package.json` is the shared workflow package. From the repo root, run it with `npm --prefix scripts run ...`:

- `resolve-ingredient-match-queue`
- `resolve-embedding-queue`
- `resolve-vector-double-check`
- `resolve-canonical-consolidation`
- `queue-worker`

Other directly-invoked scripts:

JavaScript/TypeScript:

- `backend/workers/daily-scraper-worker/runner.js` (canonical entrypoint)
- `backend/scripts/daily-scraper.js` (legacy compatibility shim)
- `backend/scripts/regenerate-mappings.js`
- `backend/scripts/relink-product-mappings.js`
- `backend/scripts/temp/seed-mock-recipes.ts`
- `backend/scripts/temp/backfill-embedding-queue.ts`

Python:

- `backend/workers/store-maintenance-worker/runner.py`
- `backend/workers/store-maintenance-worker/import_new_stores.py`
- `backend/workers/store-maintenance-worker/update_target_zipcodes.py`
- `backend/workers/store-maintenance-worker/fix_missing_geo.py`
- `backend/workers/store-maintenance-worker/backfill_scraped_zipcodes.py`

## GitHub workflows (`.github/workflows`)

Current workflows include:

- `daily-scraper-matrix.yml` (runs `backend/workers/daily-scraper-worker/runner.js`)
- `nightly-workflow.yml` (orchestrates the queue and scraper workflows)
- `nightly-ingredient-queue.yml` / `test-ingredient-queue.yml` (run `resolve-ingredient-match-queue`)
- `nightly-embedding-queue.yml` / `test-embedding-queue.yml` (run `resolve-embedding-queue`)
- `regenerate-mappings.yml` (runs `resolve-ingredient-match-queue` for relink passes)
- `store_maintenance.yml`
- plus backup/reset/init/main utility workflows.

Most workflows are manually dispatchable; some have schedules (for example nightly and weekly mapping tasks).

## Known operational drift to resolve

- `initiating-workflow.yml` references `backend/scripts/seed-generated-mock-recipes.ts`, which is not present in current tree.
- Root `package.json` still includes script aliases for missing files:
  - `backend/scripts/cleanup-recent-standardized-ingredients.ts`
  - `backend/scripts/backfill-clerk-user-ids.ts`
  - `backend/scripts/test-traderjoes-scraper.js`
  - `backend/scripts/test-99ranch-scraper.js`
- Ensure workflow script paths stay in sync with `backend/scripts/` before relying on scheduled runs.

## Maintenance checklist for future changes

1. When adding/changing scripts, update this file and any affected workflow.
2. When adding/changing API routes, update `api-and-integrations.md`.
3. When changing queue/scoring behavior, update `queue-and-standardization.md`.
4. Keep docs updates in the same PR/commit as behavior changes.
