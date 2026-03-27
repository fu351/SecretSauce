# Frontend Scraper Worker

Frontend-facing scraper orchestration worker for grocery-search UX flows.

## Key Files

- `processor.ts` - server-side orchestration for `/api/grocery-search` (cache pipeline + direct scraper fallback).
- `batch-processor.ts` - server-side batch scraper orchestration for `/api/batch-scraper`.
- `batch-runner.ts` - optional runner wrapper for batch processor jobs.
- `batch-utils.ts` - shared types/constants/helpers for batch processor and route wiring.
- `client-processor.ts` - browser-facing API fetch + response processing helpers.
- `runner.ts` - frontend entrypoint (`searchGroceryStores`) used by UI hooks/components.
- `utils.ts` - request URL builders, timeout/max-results resolvers, and result normalization.
- `index.ts` - public exports for frontend-safe helpers.
- `__tests__/*` - coverage for utility, processor, and runner behavior.

## Usage

Primary import path:

- `@/backend/workers/frontend-scraper-worker/runner`

## Environment

- `NEXT_PUBLIC_SCRAPER_MAX_RESULTS` - optional max result cap per store for frontend calls.
- `SCRAPER_MAX_RESULTS` - server fallback max result cap per store.
- `FRONTEND_SCRAPER_*` env vars are supported when invoking `runner.ts` directly.

## Processing Flow

1. Build request URL for `/api/grocery-search` with zip/store/refresh options.
2. Route delegates to `frontend-scraper-worker/processor.ts` for scraper orchestration.
3. Processor resolves user/store metadata, then runs cache-first pipeline with direct scraper fallback.
4. `/api/batch-scraper` delegates to `frontend-scraper-worker/batch-processor.ts` for batch orchestration.
5. Client processor normalizes API results, applies max-results caps, and sorts by lowest total.
