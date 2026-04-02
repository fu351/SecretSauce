# Daily Scraper Worker

Store-first scraper that loads active grocery stores and canonical ingredients from Supabase, queries the store scrapers, and writes price history back through the bulk insert RPC.

## Key Files

- `runner.js` - canonical entrypoint and run summary / shutdown handling
- `config.js` - env parsing, defaults, and stop-reason constants
- `processor.js` - store-by-store orchestration and stop conditions
- `scrape.js` - scraper dispatch, native batch fallback, and Target-specific handling
- `insert-queue.js` - batched RPC inserts with dedupe, backpressure, and retry logic
- `db.js` - Supabase reads/writes for stores, ingredients, and failure metadata
- `utils.js` - shared normalization helpers used across the worker
- `__tests__/utils.test.js` - unit coverage for the shared helpers

## Run

From the repo root:

```bash
node backend/orchestrators/daily-scraper-pipeline/pipeline.js
```

Legacy shim:

```bash
node backend/orchestrators/daily-scraper-pipeline/pipeline.js
```

Docker image:

```bash
docker build -f backend/docker/Dockerfile.daily-scraper .
```

Local compose matrix:

```bash
docker compose -f docker/compose/local/daily-scraper-matrix.yml up --build
```

## Required Env Vars

These must be set for any real run:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`config.js` auto-loads `.env.local` and then `.env` from the repo root.

Common worker knobs:

- `STORE_BRAND` - limit to one brand such as `target`, `kroger`, `aldi`, `traderjoes`, `andronicos`, `meijer`, or `99ranch`
- `STORE_STATE`, `STORE_CITY`, `STORE_CITIES_CSV`, `STORE_ZIP_MIN`, `STORE_ZIP_MAX` - store filters
- `STORE_LIMIT`, `INGREDIENT_LIMIT` - hard caps for smoke tests
- `STORE_CONCURRENCY`, `SCRAPER_BATCH_SIZE`, `SCRAPER_BATCH_CONCURRENCY`, `INGREDIENT_DELAY_MS`
- `DAILY_SCRAPER_DRY_RUN` or `DRY_RUN` - skip DB writes when true
- `DAILY_SCRAPER_SUMMARY_MODE` - `basic` or `detailed`
- `MAX_CONSECUTIVE_STORE_ERRORS`
- `INSERT_BATCH_SIZE`, `INSERT_CONCURRENCY`, `INSERT_QUEUE_MAX_SIZE`
- `INSERT_RPC_MAX_RETRIES`, `INSERT_RPC_RETRY_BASE_DELAY_MS`, `INSERT_RPC_RETRY_MAX_DELAY_MS`

## Execution Flow

1. Load config and env, then verify Supabase credentials.
2. Fetch active `grocery_stores` rows with ZIP codes, apply brand and location filters, and honor `STORE_LIMIT`.
3. Fetch unique canonical ingredient names from `standardized_ingredients`, honoring `INGREDIENT_LIMIT`.
4. Process stores in parallel up to `STORE_CONCURRENCY`.
5. For each store, query ingredients in batches of `SCRAPER_BATCH_SIZE`.
6. Prefer native batch scraper entrypoints when available; otherwise fall back to per-ingredient scrapers.
7. Normalize valid prices and queue them for RPC inserts through `fn_bulk_insert_ingredient_history`.
8. Record store failures in `failed_scrapes_log`; record Target HTTP 404 events in `grocery_stores.metadata`.
9. Print a run summary, and exit non-zero if a non-dry run inserts fewer than 20% of scraped rows.

Dry runs still scrape and summarize, but skip database writes.

## Testing

Run the worker helper tests:

```bash
npm run test:run -- backend/workers/daily-scraper-worker/__tests__/utils.test.js
```

For the full repository test suite:

```bash
npm test
```
