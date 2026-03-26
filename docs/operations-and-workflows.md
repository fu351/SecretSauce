# Operations and Workflows

Last verified: 2026-03-20.

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
- `npm run backfill-embedding-queue`

### Scraper/data scripts (`backend/scripts/` and `workers/`)

JavaScript/TypeScript:

- `workers/daily-scraper-worker/runner.js` (canonical entrypoint)
- `backend/scripts/daily-scraper.js` (legacy compatibility shim)
- `backend/scripts/resolve-ingredient-match-queue.ts`
- `backend/scripts/resolve-embedding-queue.ts`
- `backend/scripts/temp/backfill-embedding-queue.ts`
- `backend/scripts/regenerate-mappings.js`
- `backend/scripts/relink-product-mappings.js`
- `backend/scripts/temp/seed-mock-recipes.ts`
- store-specific test scripts (`test-traderjoes-scraper.js`, `test-99ranch-scraper.js`)

Python:

- `workers/store-maintenance-worker/runner.py`
- `workers/store-maintenance-worker/import_new_stores.py`
- `workers/store-maintenance-worker/update_target_zipcodes.py`
- `workers/store-maintenance-worker/fix_missing_geo.py`
- `workers/store-maintenance-worker/backfill_scraped_zipcodes.py`

## GitHub workflows (`.github/workflows`)

Current workflows include:

- `daily-scraper-matrix.yml` (runs `workers/daily-scraper-worker/runner.js`)
- `nightly-workflow.yml`
- `nightly-ingredient-queue.yml`
- `nightly-embedding-queue.yml`
- `test-ingredient-queue.yml`
- `test-embedding-queue.yml`
- `regenerate-mappings.yml`
- `store_maintenance.yml`
- plus backup/reset/init/main utility workflows.

Most workflows are manually dispatchable; some have schedules (for example nightly and weekly mapping tasks).

## Known operational drift to resolve

- `initiating-workflow.yml` references `backend/scripts/seed-generated-mock-recipes.ts`, which is not present in current tree.
- Ensure workflow script paths stay in sync with `backend/scripts/` before relying on scheduled runs.

## Maintenance checklist for future changes

1. When adding/changing scripts, update this file and any affected workflow.
2. When adding/changing API routes, update `api-and-integrations.md`.
3. When changing queue/scoring behavior, update `queue-and-standardization.md`.
4. Keep docs updates in the same PR/commit as behavior changes.
