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

### Scraper/data scripts (`scripts/` and `workers/`)

JavaScript/TypeScript:

- `workers/daily-scraper-worker/runner.js` (canonical entrypoint)
- `scripts/daily-scraper.js` (legacy compatibility shim)
- `scripts/resolve-ingredient-match-queue.ts`
- `scripts/resolve-embedding-queue.ts`
- `scripts/temp/backfill-embedding-queue.ts`
- `scripts/regenerate-mappings.js`
- `scripts/relink-product-mappings.js`
- `scripts/temp/seed-mock-recipes.ts`
- store-specific test scripts (`test-traderjoes-scraper.js`, `test-99ranch-scraper.js`)

Python:

- `scripts/store_maintenance.py`
- `scripts/import_new_stores.py`
- `scripts/update_target_zipcodes.py`
- `scripts/fix_missing_geo.py`
- `scripts/backfill_scraped_zipcodes.py`

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

- `initiating-workflow.yml` references `scripts/seed-generated-mock-recipes.ts`, which is not present in current tree.
- Ensure workflow script paths stay in sync with `scripts/` before relying on scheduled runs.

## Maintenance checklist for future changes

1. When adding/changing scripts, update this file and any affected workflow.
2. When adding/changing API routes, update `api-and-integrations.md`.
3. When changing queue/scoring behavior, update `queue-and-standardization.md`.
4. Keep docs updates in the same PR/commit as behavior changes.
