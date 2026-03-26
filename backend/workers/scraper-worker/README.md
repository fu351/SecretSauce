# Scraper Worker

Bare-bones scraper interface worker that hosts store adapters plus universal runtime controls.

## Layout

- `index.js` - exports all store scraper functions and universal control helpers.
- `stores/*` - store-specific scrapers and optional batch variants.
- `utils/*` - shared crawler, logging, retry, rate-limit, and normalization utilities.
- `ingredient-pipeline.ts` - canonical ingredient -> multi-store pricing pipeline.
- `grocery-scrapers.ts` - compatibility wrapper that re-exports frontend helper from `frontend-scraper-worker`.
- `universal-controls.js` - worker-wide runtime controls for live activation and timeout behavior.

This worker intentionally does not own batch/API orchestration. Orchestration lives in:

- `backend/workers/frontend-scraper-worker/*` for client-facing grocery search flows.
- `backend/workers/daily-scraper-worker/*` for batch/daily scraping flows.

## Universal Controls

`universal-controls.js` exposes:

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
