# Scraper Worker

Bare-bones scraper interface worker that hosts store adapters plus universal runtime controls.

## Layout

- `index.js` - exports all store scraper functions and universal control helpers.
- `index.ts` - typed worker-style exports for scraper-worker `worker`, `processor`, and `runner`.
- `worker.ts` - shared store/runtime/job types and normalization helpers for scraper-worker wrappers.
- `processor.ts` - thin universal store-query processor wrapper over `index.js` exports.
- `runner.ts` - worker-style loop wrapper around `processor.ts` for one-shot or scheduled runs.
- `stores/*` - store-specific scrapers and optional batch variants.
- `utils/*` - shared crawler, logging, retry, rate-limit, and normalization utilities.
- `ingredient-pipeline.ts` - canonical ingredient -> multi-store pricing pipeline.
- `utils/runtime-config.js` - worker-wide runtime controls for live activation and timeout behavior.

This worker intentionally does not own batch/API orchestration. Orchestration lives in:

- `backend/workers/frontend-scraper-worker/*` for client-facing grocery search flows.
- `backend/workers/daily-scraper-worker/*` for batch/daily scraping flows.

## Runner Inputs

`runner.ts` reads optional env vars for job construction:

- `SCRAPER_RUNNER_STORE` - required store key (`walmart`, `target`, `kroger`, etc.).
- `SCRAPER_RUNNER_QUERY` - single query mode input.
- `SCRAPER_RUNNER_QUERIES_JSON` - batch mode JSON array of query strings.
- `SCRAPER_RUNNER_ZIP_CODE` - optional zip context passed to store scrapers.
- `SCRAPER_RUNNER_TARGET_STORE_METADATA_JSON` - optional Target store metadata payload.
- `SCRAPER_RUNNER_BATCH_CONCURRENCY` - optional batch scraper concurrency hint.
- `SCRAPER_RUNNER_MAX_CYCLES`, `SCRAPER_WORKER_INTERVAL_SECONDS` - runner loop controls.
- `SCRAPER_RUNNER_LIVE_ACTIVATION`, `SCRAPER_RUNNER_BYPASS_TIMEOUTS`, `SCRAPER_RUNNER_TIMEOUT_MULTIPLIER`, `SCRAPER_RUNNER_TIMEOUT_FLOOR_MS` - runtime control overrides for `runWithUniversalScraperControls`.

## Universal Controls

`utils/runtime-config.js` exposes:

- `getUniversalScraperControlsFromEnv()`
- `mergeUniversalScraperControls(overrides)`
- `runWithUniversalScraperControls(overrides, fn)`

Supported env vars:

- `SCRAPER_WORKER_LIVE_ACTIVATION`
- `SCRAPER_WORKER_BYPASS_TIMEOUTS`
- `SCRAPER_WORKER_TIMEOUT_MULTIPLIER`
- `SCRAPER_WORKER_TIMEOUT_FLOOR_MS`

Fallback envs still honored for compatibility:

- `SCRAPER_LIVE_TIMEOUT_MULTIPLIER`
- `SCRAPER_LIVE_TIMEOUT_FLOOR_MS`
