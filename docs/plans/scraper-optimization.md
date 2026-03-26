# Scraper Optimization Plan

## Overview

This plan addresses the critical, high, and medium issues found in the scraper system audit. Issues are grouped into 5 PRs ordered by priority and risk.

---

## PR 1 — Core Orchestration Fixes

**Files:** `backend/workers/daily-scraper-worker/runner.js`, `.github/workflows/config/pipeline-defaults.json`

### Issue 1 (CRITICAL) — Store Concurrency

`STORE_CONCURRENCY` env var is defined and passed through GitHub Actions but never used for actual store-level parallelism. Stores are processed sequentially, meaning 50 stores × 30s = 25+ minutes minimum.

**Fix:**
- Extract the per-store loop body into `async function processStore(store, storeIndex)` that returns results instead of mutating shared state
- Replace the `for` loop with `mapWithConcurrency(stores, STORE_CONCURRENCY, processStore)` — the helper is already used for ingredient-level concurrency
- Give each store its own `pendingResults` buffer and flush independently to avoid cross-store race conditions
- Aggregate totals after all stores complete

**Lines:** `runner.js:542-682`

---

### Issue 2 (CRITICAL) — Main Loop Timeout

No wall-clock timeout inside Node. If stuck on a single store, the entire job hangs until GitHub Actions hard-kills it at 180 minutes, losing any buffered results.

**Fix:**
- Add `SCRAPER_TOTAL_TIMEOUT_MS` env var (default: `(SCRAPER_TIMEOUT_MINUTES - 5) * 60 * 1000`, i.e. 85 min)
- Set a `deadlineReached = true` flag via `setTimeout` at the start of `scrapeIngredientsAndInsertBatched`
- Check `deadlineReached` between ingredient chunks inside `processStore` and break early with a clear warning log
- After the deadline fires, flush all remaining buffered results cleanly before exiting
- Call `deadlineTimer.unref()` so it doesn't prevent process exit
- Add `scraper_total_timeout_ms` to `pipeline-defaults.json`

**Lines:** `runner.js:511-695`

---

### Issue 5 (MEDIUM) — Remove Insert Sleep

Hardcoded `await sleep(1000)` fires between every RPC insert batch. With 20 batches this adds 20 seconds of pure waiting with no I/O happening.

**Fix:**
- Delete the `await sleep(1000)` in `flushPendingResults`
- If inter-batch breathing room is ever needed, use a configurable `INSERT_BATCH_DELAY_MS` env var defaulting to `0`

**Lines:** `runner.js:520-539`

---

### Issue 7 (MEDIUM) — Inconsistent Target 404 Handling

Target 404s push to `scrapeStats` but don't consistently set `hadError: true`, while all other 404s do. A future code path divergence could cause the store-skip logic (which keys on `isHttp404`) to silently fail for Target stores.

**Fix:**
- Merge the `isTarget404` and `isHttp404` branches so both always return `hadError: true, isHttp404: true`
- Preserve the `scrapeStats.target404s` push inside the merged branch for Target-specific tracking

**Lines:** `runner.js:466-488`

---

## PR 2 — Trader Joe's Fixes

**File:** `scrapers/stores/traderjoes.js`

### Issue 3 (HIGH) — Unbounded In-Memory Cache

`traderJoesResultCache` uses lazy TTL eviction — expired entries are only deleted on re-access. Unique long-tail ingredients never get re-queried, so they accumulate forever over a 90-minute scraper run.

**Fix:**
- Add `sweepExpiredCacheEntries()` that iterates the cache Map and deletes entries where `now - entry.fetchedAt > TJ_CACHE_TTL_MS`
- Call it at the end of each `searchTraderJoesBatch` (once per batch, not per request)
- Add a hard size cap (e.g. 5000 entries) — if exceeded after sweep, evict oldest entries by Map insertion order

**Lines:** `traderjoes.js:101-103`

---

### Issue 4 (HIGH) — Jina 429 Cooldown Broken

When a 429 is received and `registerJina429AndMaybeEnterCooldown` returns `true`, the code calls `break` to exit the retry loop — but the computed `delay` is never `await`ed. The current request throws immediately while the cooldown is still active for subsequent callers.

**Fix:**
- Add `await sleep(Math.min(delay, JINA_COOLDOWN_SLEEP_CAP_MS))` **before** the `break` in the `status === 429` branch of `withRetry`
- The cap prevents sleeping the full 90s on this call; the cooldown state is already set so subsequent callers also sleep appropriately

**Lines:** `traderjoes.js:45-53`

---

## PR 3 — API Rate Limiting

**File:** `app/api/batch-scraper/route.ts`

### Issue 6 (MEDIUM) — No Rate Limiting on Batch Scraper Endpoint

The endpoint only checks `CRON_SECRET`. Any caller with the secret can send arbitrarily large payloads or hit the endpoint repeatedly with no throttling.

**Fix:**
- Add a module-level `Map<string, { count: number, windowStart: number }>` sliding window rate limiter keyed by caller IP
- After the auth check, extract IP from `x-forwarded-for` and call `checkRateLimit(ip)` — return `429 Too Many Requests` if exceeded
- Default limits: 10 requests per 60-second window
- Clean up stale map entries when `rateLimitWindow.size > 500`
- Note: `CRON_SECRET` remains the primary access control; this is defense-in-depth. A WAF or Vercel Edge Middleware rule would be more reliable for multi-region deployments.

**Lines:** `route.ts:63-253`

---

## PR 4 — Unit Extraction Deduplication

**Files:** `scrapers/utils/daily-scraper-raw-unit.ts`, `scrapers/types.ts`, `backend/scripts/utils/daily-scraper-utils.js`, `scrapers/stores/traderjoes.js`

### Issue 8 (MEDIUM) — 4 Duplicate Unit Extraction Implementations

The same unit-extraction logic exists in four places with slight variations:
- `scrapers/utils/daily-scraper-raw-unit.ts` — `extractUnitHintFromDailyScraper`
- `scrapers/stores/traderjoes.js` — `resolveQtyUnitText` + `inferUnitFromPricePerUnit`
- `backend/scripts/utils/daily-scraper-utils.js` — private `extractUnitHint`
- `scrapers/types.ts` — private `extractUnitHint` + `buildProductNameWithUnit`

**Fix:**
- Designate `scrapers/utils/daily-scraper-raw-unit.ts` as the canonical module; expand it with shared helpers (`hasQuantityAndUnitToken`, `normalizeWhitespace`, `buildProductNameWithUnit`)
- In `scrapers/types.ts`: delete local `extractUnitHint` and `buildProductNameWithUnit`, import from canonical module
- In `backend/scripts/utils/daily-scraper-utils.js`: replace the private function body with a call to the canonical implementation
- In `traderjoes.js`: keep TJ-specific field preprocessing (`size_qty`, `pack_qty`, `measure_unit`) local, but delegate the generic fallback to the canonical module via `require`
- This is a refactor only — no behavior changes

---

## PR 5 — Parallel Store Pagination

**File:** `backend/workers/daily-scraper-worker/runner.js`

### Issue 9 (MEDIUM) — Sequential N+1 DB Queries for Store Fetching

Store fetching uses a serial `while` loop that queries 1000 rows at a time. For unfiltered full runs with many stores, this means many sequential DB round-trips.

**Fix:**
- On the first query, use `.select(..., { count: 'exact' })` to get the total row count
- If `totalPages <= 1`, return immediately — no change to the common filtered-run path
- If `totalPages > 1`, issue pages 2–N in parallel with `Promise.all`, capped at 5 concurrent fetches to avoid overwhelming the DB connection pool
- Flatten and return combined results

**Lines:** `runner.js:300-330`

---

## Implementation Order

| PR | Issues | Scope | Risk |
|----|--------|-------|------|
| 1 | 1, 2, 5, 7 | `daily-scraper.js` refactor | High impact — core orchestration |
| 2 | 3, 4 | `traderjoes.js` only | Low blast radius |
| 3 | 6 | `route.ts` only | Low blast radius |
| 4 | 8 | Refactor across 4 files | No behavior change |
| 5 | 9 | `daily-scraper.js` pagination | Low impact for filtered runs |

Start with PR 1 as it addresses the two critical issues and bundles three related medium fixes into the same function being refactored.
