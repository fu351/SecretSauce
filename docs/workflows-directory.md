# Workflows Directory

## Agent Metadata

- `Doc Kind`: `directory`
- `Canonicality`: `reference`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `.github/workflows/`, `scripts/`, `queue/`
- `Update Trigger`: Workflow triggers, composition graph, or script/RPC responsibilities change.

## Agent Use

- `Read this when`: debugging CI orchestration or selecting the right workflow entrypoint.
- `Stop reading when`: you have identified the target workflow and need direct YAML details.
- `Escalate to`: `.github/workflows/*.yml`, `docs/scripts-directory.md`.


## Purpose

Quick routing for `.github/workflows/`: what runs, when it runs, and how workflows compose.

## Core Orchestration Flows

### Nightly pipeline

`nightly-workflow.yml` orchestrates the main scheduled pipeline:

1. `daily-purge.yml` (wipe `ingredients_recent`, supports dry-run)
2. seed temporary canonical placeholder (only if `standardized_ingredients` is empty)
3. `daily-scraper-matrix.yml` (per-store scraping)
4. `update-unit-weight-estimates.yml`
5. `nightly-ingredient-queue.yml`
6. cleanup temporary canonical placeholder

Schedule: daily at `11:55 UTC` (`55 11 * * *`).

### Initiating pipeline (manual bootstrap)

`initiating-workflow.yml` runs a bootstrap flow:

1. seed mock recipes (`scripts/seed-mock-recipes.ts`)
2. pre-scrape queue pass (`nightly-ingredient-queue.yml`)
3. seed temporary canonical placeholder if needed
4. scraper matrix (`daily-scraper-matrix.yml`)
5. post-scrape queue pass (`nightly-ingredient-queue.yml`)
6. update unit estimates (`update-unit-weight-estimates.yml`)
7. cleanup temporary canonical placeholder

Trigger: manual (`workflow_dispatch`) only.

## Reusable Workflows (workflow_call)

- `daily-purge.yml`: purges `ingredients_recent` via Supabase client.
- `daily-scraper-matrix.yml`: matrix runner for `scripts/daily-scraper.js` with store/time/batch controls.
- `nightly-ingredient-queue.yml`: batched queue resolver loop (`npm --prefix scripts run resolve-ingredient-match-queue`).
- `update-unit-weight-estimates.yml`: invokes `scheduled_update_unit_estimates` and verifies with `check_pricing_health`.

## Workflow Catalog

| Workflow File | Trigger(s) | Primary Responsibility | Key Script / RPC |
|---|---|---|---|
| `.github/workflows/nightly-workflow.yml` | `schedule`, `workflow_dispatch` | Main nightly orchestrator | Composes reusable workflows below |
| `.github/workflows/initiating-workflow.yml` | `workflow_dispatch` | Manual bootstrap/init orchestration | `scripts/seed-mock-recipes.ts` + reusable workflows |
| `.github/workflows/daily-scraper-matrix.yml` | `workflow_call`, `workflow_dispatch` | Per-store matrix scrape with guardrails/timeouts | `node scripts/daily-scraper.js` |
| `.github/workflows/nightly-ingredient-queue.yml` | `workflow_call`, `workflow_dispatch` | Batched queue draining/resolution with source/review-mode filtering | `npm --prefix scripts run resolve-ingredient-match-queue` |
| `.github/workflows/daily-purge.yml` | `workflow_call`, `workflow_dispatch` | Wipe `ingredients_recent` (or dry-run count) | Supabase delete from `ingredients_recent` |
| `.github/workflows/update-unit-weight-estimates.yml` | `workflow_call`, `workflow_dispatch` | Recompute/verify unit weight estimates | RPC `scheduled_update_unit_estimates`, `check_pricing_health` |
| `.github/workflows/regenerate-mappings.yml` | `schedule`, `workflow_dispatch` | Relink recipe/product mappings and resolve queue | RPC `fn_relink_recipe_ingredients`, `fn_relink_product_mappings`; queue resolver |
| `.github/workflows/backfill-scraped-zipcodes.yml` | `schedule`, `workflow_dispatch` | Backfill `scraped_zipcodes` city/state/geom | `python scripts/backfill_scraped_zipcodes.py` |
| `.github/workflows/import_stores.yml` | `workflow_dispatch` | Refresh target ZIP priorities and import stores | `python scripts/update_target_zipcodes.py`; `python scripts/import_new_stores.py` |
| `.github/workflows/geoscraper.yml` | `workflow_dispatch` | Matrix geoscrape by selected stores; mark events complete | `python scripts/geoscraper.py` |
| `.github/workflows/geoscraper-sequential.yml` | `workflow_dispatch` | Sequential ZIP-based geoscrape (legacy path) | `python scripts/geoscraper.py --zip ...` |
| `.github/workflows/geo_fix.yml` | `workflow_dispatch` | Backfill missing store geometry in `grocery_stores` | `python scripts/fix_missing_geo.py` |
| `.github/workflows/daily-scraper.yml` | `workflow_dispatch` | Legacy non-matrix scraper flow | `node scripts/daily-scraper.js` |
| `.github/workflows/test-ingredient-queue.yml` | `workflow_dispatch` | Dry-run queue resolver smoke test | `npm run resolve-ingredient-match-queue` |
| `.github/workflows/back-up.yml` | `workflow_dispatch` | Backup/reset/restore ingredient ecosystem via RPC | RPC `fn_ingredient_ecosystem` |
| `.github/workflows/main.yml` | `push` on `main`, `workflow_dispatch` | Actor-gated CI bump/log append flow | append `.github/ci-bump.log` + push |

## Operational Notes

- `daily-scraper.yml`, `geoscraper-sequential.yml` are legacy/special-case workflows; prefer matrix/composed flows unless you need narrow manual control.
- `import_stores.yml` and `geo_fix.yml` contain “scheduled/manual” job split comments, but current triggers are manual-only (`workflow_dispatch`).
- Queue workflow defaults are source/review constrained (`queue_source=scraper`, `queue_review_mode=ingredient`) and unit writes are opt-in.

## Where To Start By Task

- Troubleshoot nightly production ingestion:
  - `nightly-workflow.yml` -> `daily-scraper-matrix.yml` -> `nightly-ingredient-queue.yml`
- Tune scraping performance/timeouts:
  - `daily-scraper-matrix.yml` + `scripts/daily-scraper.js`
- Queue quality/throughput tuning:
  - `nightly-ingredient-queue.yml` + `queue/` + `docs/ingredient-queue-realtime-plan.md`
- Store footprint/geo maintenance:
  - `import_stores.yml`, `geoscraper.yml`, `geo_fix.yml`, `backfill-scraped-zipcodes.yml`
