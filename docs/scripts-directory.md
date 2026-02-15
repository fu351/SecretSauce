# Scripts Directory

## Agent Metadata

- `Doc Kind`: `directory`
- `Canonicality`: `reference`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `scripts/`, `queue/worker/runner.ts`, `.github/workflows/`
- `Update Trigger`: Script inventory, command usage, or script-to-workflow mappings change.

## Agent Use

- `Read this when`: selecting the correct operational script and understanding side effects.
- `Stop reading when`: task requires workflow orchestration details rather than script internals.
- `Escalate to`: `docs/workflows-directory.md`, script source files.


## Purpose

Quick routing for operational scripts in `scripts/`: what each script does, when to run it, and what it writes.

## Safety and Prerequisites

- Most scripts write to Supabase and require:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Prefer preview modes first (`--dry-run` where available).
- JS/TS scripts assume deps are installed (`npm ci --prefix scripts`).
- Python scripts assume runtime deps are installed (`supabase`, `requests`, `ijson`).

## Script Task Map

| Task | Primary Script(s) | Notes |
|---|---|---|
| Nightly ingredient price scraping into `ingredients_history`/`ingredients_recent` | `scripts/daily-scraper.js` | Main ingestion path; uses `fn_bulk_insert_ingredient_history` RPC. Controlled by env vars (store filters, limits, concurrency). |
| Resolve ingredient match queue | `scripts/resolve-ingredient-match-queue.ts` | Thin shim to `queue/` runtime (`runQueueResolverFromEnv`). Use root `npm run resolve-ingredient-match-queue` or `npm --prefix scripts run resolve-ingredient-match-queue`. |
| Run persistent queue worker | `queue/worker/runner.ts` (via scripts package) | Use `npm run queue-worker` (root) or `npm --prefix scripts run queue-worker`. |
| Import/refresh grocery stores from AllThePlaces | `scripts/import_new_stores.py` | Defaults to target ZIP strategy (`target_zipcodes`); supports `--brand` and `--all-zipcodes`. |
| Real-time ZIP-triggered store scraping | `scripts/geoscraper.py` | Event/webhook-oriented; accepts ZIP input via flags or `REALTIME_TARGET_ZIPCODES`. |
| Build target ZIP list from user profiles | `scripts/update_target_zipcodes.py` | Calls DB RPCs `update_target_zipcodes` and optional `add_neighbor_zipcodes`. |
| Backfill `scraped_zipcodes` city/state/geom | `scripts/backfill_scraped_zipcodes.py` | Uses Zippopotam API, supports `--loop`, `--concurrency`, `--dry-run`. |
| Fix missing/centroid store geometry in `grocery_stores` | `scripts/fix_missing_geo.py` | Uses AllThePlaces first; optional Google geocode ZIP fallback (`GOOGLE_MAPS_API_KEY`). |
| Validate Target store IDs in metadata | `scripts/validate-target-store-ids.js` | Compares DB IDs vs Target nearest-store lookup (`--limit`, `--zip`). |
| Backfill missing Target store IDs | `scripts/backfill-target-store-ids.js` | Writes `metadata.target_store_id`; supports `--dry-run`, `--limit`, `--zip`. |
| Analyze Target scraper 404 patterns | `scripts/analyze-404s.js` | Reads `target_404_log` and prints store/ingredient/ZIP trends. |
| Reproduce 404-prone ingredient queries | `scripts/test-ingredient-404s.js` | Tests canonical ingredients against a known Target store (`TARGET_TEST_ZIP`, `TARGET_TEST_STORE_ID`). |
| Validate Trader Joe's scraper in single-store mode | `scripts/test-traderjoes-scraper.js` | Daily-scraper-style harness that hard-enforces one `traderjoes` store and validates output shape/sorting/location consistency. |
| Seed dev/mock recipes | `scripts/seed-mock-recipes.ts` | Upserts mock recipes through `lib/dev/mock-recipes` RPC contract; requires `SUPABASE_SEED_AUTHOR_ID`. |

## Script Catalog

| File | Runtime | Side Effects |
|---|---|---|
| `scripts/daily-scraper.js` | Node | Scrapes product prices and inserts via `fn_bulk_insert_ingredient_history`; logs failures to `failed_scrapes_log`. |
| `scripts/resolve-ingredient-match-queue.ts` | TSX | Executes queue resolver pipeline. |
| `scripts/seed-mock-recipes.ts` | TSX | Upserts recipe data in DB. |
| `scripts/import_new_stores.py` | Python | Inserts new rows into `grocery_stores`; updates `scraped_zipcodes`. |
| `scripts/geoscraper.py` | Python | Inserts ZIP-scoped store rows; updates `scraped_zipcodes`. |
| `scripts/update_target_zipcodes.py` | Python | Rebuilds/expands `target_zipcodes`. |
| `scripts/backfill_scraped_zipcodes.py` | Python | Updates metadata/geography in `scraped_zipcodes`. |
| `scripts/fix_missing_geo.py` | Python | Updates `grocery_stores.geom`; adjusts failure counters in run logic. |
| `scripts/validate-target-store-ids.js` | Node | Read/compare pass; no DB writes. |
| `scripts/backfill-target-store-ids.js` | Node | Updates `grocery_stores.metadata` for Target store IDs. |
| `scripts/analyze-404s.js` | Node | Read-only analysis of `target_404_log`. |
| `scripts/test-ingredient-404s.js` | Node | Read-only test calls to scraper APIs + DB reads. |
| `scripts/test-traderjoes-scraper.js` | Node | Read-only test harness for Trader Joe's scraper using one DB-backed store + canonical ingredient sample. |
| `scripts/scraper_common.py` | Python module | Shared helper module for store import/geoscraper/backfill flows. |
| `scripts/utils/daily-scraper-utils.js` | JS module | Shared helper module for daily scraper batching/filtering/normalization. |
| `scripts/utils/canonical-matching.ts` | TS module | Shared canonical-name similarity helpers. |

## High-Value Commands

```bash
# Queue resolver (single run)
npm run resolve-ingredient-match-queue

# Queue worker (persistent loop)
npm run queue-worker

# Daily scraper (env-driven; typically run from workflows)
node scripts/daily-scraper.js

# Update target ZIPs then import stores
python scripts/update_target_zipcodes.py --neighbor-radius 5
python scripts/import_new_stores.py

# Safe preview: backfill Target store IDs
node scripts/backfill-target-store-ids.js --dry-run --limit 20
```

## Workflow References

These scripts are actively used by CI workflows:

- `scripts/daily-scraper.js`: `.github/workflows/daily-scraper-matrix.yml`
- `scripts/resolve-ingredient-match-queue.ts`: `.github/workflows/nightly-ingredient-queue.yml`, `.github/workflows/test-ingredient-queue.yml`, `.github/workflows/regenerate-mappings.yml`
- `scripts/geoscraper.py`: `.github/workflows/geoscraper.yml`
- `scripts/import_new_stores.py` + `scripts/update_target_zipcodes.py`: `.github/workflows/import_stores.yml`
- `scripts/backfill_scraped_zipcodes.py`: `.github/workflows/backfill-scraped-zipcodes.yml`
- `scripts/fix_missing_geo.py`: `.github/workflows/geo_fix.yml`
