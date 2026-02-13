# Scrapers Directory

## Agent Metadata

- `Doc Kind`: `directory`
- `Canonicality`: `reference`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `lib/scrapers/`, `lib/ingredient-pipeline.ts`, `app/api/grocery-search/route.ts`, `scripts/daily-scraper.js`
- `Update Trigger`: Store scraper status, integration points, or runtime/env controls change.

## Agent Use

- `Read this when`: debugging scraper behavior or mapping store coverage and runtime controls.
- `Stop reading when`: issue is clearly in downstream database or workflow orchestration.
- `Escalate to`: `docs/scripts-directory.md`, `docs/workflows-directory.md`, specific scraper modules.


## Purpose

Quick routing for `lib/scrapers/`: scraper entry points, store coverage, runtime behavior, and debugging paths.

## Integration Points

- Main export surface: `lib/scrapers/index.js`
- Primary consumers:
  - `scripts/daily-scraper.js`
  - `lib/ingredient-pipeline.ts`
  - `app/api/grocery-search/route.ts`

## Result Contract (Practical)

Scrapers are expected to return arrays of product-like objects where:

- `price` is numeric and `> 0`
- one of `product_name` / `title` / `name` is present
- optional: `image_url`, `product_id`/`id`, `location`, `provider`

Canonical TS shape is documented in `lib/scrapers/types.ts` (`ScraperResult`), but many scrapers still return legacy-compatible variants (`title`, extra metadata).

## Store Scraper Matrix

| Store | Entry Function | Implementation Mode | Current Status |
|---|---|---|---|
| Target | `getTargetProducts` | Target RedSky API + rate limiting + retry + cache + in-flight dedupe | Active (primary) |
| Walmart | `searchWalmartAPI` (`searchWalmart`) | Direct Walmart HTML parse + optional Exa+LLM fallback + UA rotation + rate limiting | Active |
| Trader Joe's | `searchTraderJoes`, `searchTraderJoesBatch` | Jina Reader + OpenAI JSON extraction + cache + 429 cooldown logic | Active |
| Aldi | `searchAldi` | Jina Reader + OpenAI JSON extraction | Active |
| Kroger | `Krogers` | Kroger OAuth + locations + products API | Active |
| Meijer | `Meijers` | Meijer location endpoint + Constructor search API | Active |
| 99 Ranch | `search99Ranch` | 99 Ranch store + search APIs | Active |
| Safeway | `searchSafeway` | Playwright/LLM path exists but currently bypassed by dummy return | Disabled (returns `[]`) |
| Whole Foods | `searchWholeFoods` | Real parser stubs exist but current path is dummy return | Disabled (returns `[]`) |
| Andronico's | `searchAndronicos` | Placeholder only | Disabled (returns `[]`) |

## Important Store-Specific Notes

- Target:
  - Store ID resolution priority: `target_store_id`/`targetStoreId`/`store_id`/`storeId` before `getNearestStore(zip)`.
  - Generic metadata DB `id` is intentionally ignored to avoid ID collisions.
  - 404s are logged to `target_404_log` when Supabase creds are available.
- Trader Joe's:
  - Batch API supports bounded parallelism and hard-stops on fatal Jina 429 cooldown errors.
- Walmart:
  - Merges direct parser results with Exa+LLM fallback results and dedupes.
  - Exa and OpenAI fallbacks are skipped if API keys are missing.
- Safeway / Whole Foods / Andronico's:
  - Wired in maps but currently return empty arrays by design; keep this in mind when interpreting “missing data”.

## Shared Runtime Helpers

- `lib/scrapers/runtime-config.js`:
  - AsyncLocalStorage-based runtime context.
  - Supports live activation timeout scaling via:
    - `SCRAPER_LIVE_TIMEOUT_MULTIPLIER`
    - `SCRAPER_LIVE_TIMEOUT_FLOOR_MS`
    - `SCRAPER_LIVE_BYPASS_TIMEOUTS`
- `lib/scrapers/jina-client.js`:
  - Global Jina request throttling, in-flight dedupe, short response cache.
- `lib/scrapers/logger.js`:
  - Debug switches via `SCRAPER_DEBUG=true` or per-scraper env flags (e.g., `TARGET_DEBUG=true`).

## Key Environment Variables

- Global/timeouts:
  - `SCRAPER_TIMEOUT_MS`
  - `SCRAPER_DEBUG`
- Target:
  - `TARGET_TIMEOUT_MS`, `TARGET_MAX_RETRIES`, `TARGET_RETRY_DELAY_MS`
  - `TARGET_CACHE_TTL_MS`
  - `TARGET_REQUESTS_PER_SECOND`, `TARGET_MIN_REQUEST_INTERVAL_MS`, `TARGET_ENABLE_JITTER`
- Walmart:
  - `WALMART_TIMEOUT_MS`, `WALMART_MAX_RETRIES`, `WALMART_RETRY_DELAY_MS`
  - `WALMART_REQUESTS_PER_SECOND`, `WALMART_MIN_REQUEST_INTERVAL_MS`, `WALMART_ENABLE_JITTER`
  - `WALMART_ROTATE_USER_AGENT`
  - `EXA_API_KEY`, `OPENAI_API_KEY`
- Trader Joe's / Aldi / Jina:
  - `OPENAI_API_KEY`
  - `JINA_API_KEY` (or `JINA_READER_API_KEY`)
  - `JINA_TIMEOUT_MS`, `JINA_MAX_RETRIES`, `JINA_RETRY_DELAY_MS`
  - Trader Joe's overrides: `TRADERJOES_*` variables (timeout, retries, cooldown, batch concurrency)
- Kroger:
  - `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`

## Diagnostics and Tests in Folder

- `lib/scrapers/target.test.js`: Target scraper functional + anti-bot probes.
- `lib/scrapers/test-scrapers.js`: multi-store smoke harness for raw responses/results.
- `lib/scrapers/test-geocoding.js`: brand-family and geocoding matching diagnostics.
- `lib/scrapers/test-target-rate-limit.js`: experimental Target Jina+LLM path test harness.
- `lib/scrapers/test-walmart-rate-limit.js`: Walmart rate-limit behavior harness.

## Where To Start By Task

- Target store routing / 404 analysis:
  - `lib/scrapers/target.js`
  - `docs/target-geospatial-integration.md`
- Nightly scrape quality or missing prices:
  - `scripts/daily-scraper.js` + relevant store scraper file
- Live grocery search timeout issues:
  - `app/api/grocery-search/route.ts`
  - `lib/scrapers/runtime-config.js`
- Jina throttling issues (Aldi/Trader Joe's):
  - `lib/scrapers/jina-client.js`
  - `lib/scrapers/traderjoes.js`
