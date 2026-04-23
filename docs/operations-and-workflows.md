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

- `npm run ingredient-match-queue-pipeline`
- `npm run ingredient-match-queue-pipeline-runner`
- `npm run embedding-queue-pipeline`
- `npm run embedding-queue-pipeline-runner`
- `npm run vector-double-check-pipeline-runner`
- `npm run backfill-embedding-queue`
- `npm --prefix scripts run vector-double-check-pipeline`
- `npm --prefix scripts run canonical-consolidation-pipeline`

### Script entrypoints

Root `package.json` exposes the common queue helpers:

- `ingredient-match-queue-pipeline`
- `embedding-queue-pipeline`
- `ingredient-match-queue-pipeline-runner`
- `embedding-queue-pipeline-runner`
- `vector-double-check-pipeline-runner`
- `backfill-embedding-queue`

`backend/scripts/package.json` is the shared workflow package. From the repo root, run it with `npm --prefix scripts run ...`:

- `ingredient-match-queue-pipeline`
- `embedding-queue-pipeline`
- `vector-double-check-pipeline`
- `canonical-consolidation-pipeline`
- `ingredient-match-queue-pipeline-runner`

Other directly-invoked scripts:

JavaScript/TypeScript:

- `backend/orchestrators/daily-scraper-pipeline.js` (canonical entrypoint)
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

- `daily-scraper-matrix.yml` (runs `backend/orchestrators/daily-scraper-pipeline.js`)
- `nightly-workflow.yml` (orchestrates the queue and scraper workflows)
- `nightly-ingredient-queue.yml` / `test-ingredient-queue.yml` (run `ingredient-match-queue-pipeline`)
- `nightly-embedding-queue.yml` / `test-embedding-queue.yml` (run `embedding-queue-pipeline`)
- `weekly-notification-digest.yml` (runs `notification-digest-pipeline`)
- `weekly-meal-planner-reminder.yml` (runs `meal-planner-reminder-pipeline`)
- `regenerate-mappings.yml` (runs `ingredient-match-queue-pipeline` for relink passes)
- `store_maintenance.yml`
- plus backup/reset/init/main utility workflows.

Weekly notification jobs require `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` to be set.

Most workflows are manually dispatchable; some have schedules (for example nightly and weekly mapping tasks).

## Known operational drift to resolve

- `initiating-workflow.yml` references `backend/scripts/seed-generated-mock-recipes.ts`, which is not present in current tree.
- Root `package.json` still includes script aliases for missing files:
  - `backend/scripts/cleanup-recent-standardized-ingredients.ts`
  - `backend/scripts/backfill-clerk-user-ids.ts`
- Ensure workflow script paths stay in sync with `backend/scripts/` before relying on scheduled runs.

## Maintenance checklist for future changes

1. When adding/changing scripts, update this file and any affected workflow.
2. When adding/changing API routes, update `api-and-integrations.md`.
3. When changing queue/scoring behavior, update `queue-and-standardization.md`.
4. Keep docs updates in the same PR/commit as behavior changes.
