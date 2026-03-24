# Batch Scraper Expansion Findings

## Goal

Document where batch scraper entrypoints would actually help, which stores are good candidates, and how we should roll them out without creating a second set of scraper behaviors to maintain.

---

## Current State

Today only Trader Joe's has a real batch entrypoint:

- `searchTraderJoes(keyword, zipCode)`
- `searchTraderJoesBatch(keywords, zipCode, options)`

The batch variant in [traderjoes.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/traderjoes.js) is not a different scraping strategy. It is a thin orchestration layer around the normal scraper that:

- accepts many keywords at once
- runs a bounded number of workers
- preserves result ordering by keyword index
- short-circuits the whole batch on shared fatal Jina rate-limit errors
- sweeps the shared result cache once at the end

The ingredient pipeline in [ingredient-pipeline.ts](/c:/Users/wmnoo/SecretSauce/scrapers/ingredient-pipeline.ts) still calls normal single-keyword scrapers. That means batch mode is most useful for store-first workflows like the daily scraper, where one store is queried for many ingredients in sequence.

---

## Where Batch Helps

Batch entrypoints are most valuable when all of the following are true:

- the same store is queried repeatedly for many keywords in one run
- the store already has request throttling or retry logic that we want to centralize
- the store already has per-keyword cache and in-flight dedupe
- repeated failures should be handled consistently across the whole store run

Batch mode is much less valuable when the scraper is currently a dummy implementation, intentionally disabled, or effectively just one cheap HTTP request with little shared state.

---

## Store Assessment

### Tier 1: Strong Batch Candidates

These stores already have the right primitives and should be straightforward to add.

#### Aldi

File: [aldi.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/aldi.js)

Why it fits:

- uses shared `createResultCache`
- uses shared `createJinaCrawler`
- uses shared rate limiting
- has a single-keyword flow very similar to Trader Joe's
- already benefits from controlling Jina request concurrency across many ingredients

Recommended batch shape:

- add `searchAldiBatch(keywords, zipCode, options = {})`
- implement it as a worker pool that calls `searchAldi(...)`
- reuse the Trader Joe's batch contract: ordered results, bounded concurrency, one result array per keyword

Special notes:

- Aldi does not currently have the Trader Joe's fatal cooldown semantics, so batch should keep going on normal per-keyword failures and only stop on truly fatal shared errors if we later define them in `jina-crawler`

#### Walmart

File: [walmart.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/walmart.js)

Why it fits:

- already uses shared cache and in-flight dedupe
- already has explicit rate limiting and retry utility usage
- merges two expensive paths per keyword: direct scrape plus Exa/LLM fallback
- batch mode would let us cap store-level concurrency instead of letting upstream callers accidentally fan out too hard

Recommended batch shape:

- add `searchWalmartBatch(keywords, zipCode, options = {})`
- have workers call the existing `searchWalmart(...)`
- preserve current fallback logic per keyword

Special notes:

- Walmart has the highest cost profile because Exa and LLM fallbacks may trigger per keyword
- batch mode should support a lower default concurrency than Aldi or Trader Joe's
- if we want bigger gains later, the next step would be a shared "direct-only first, fallback selectively" batch policy, but that is a second-phase optimization, not required for v1

#### Target

File: [target.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/target.js)

Why it fits:

- already has shared cache and in-flight dedupe
- already uses shared retry utility and rate limiter
- store resolution is expensive enough that batching can reduce churn in higher-level callers

Recommended batch shape:

- add `searchTargetBatch(keywords, storeMetadata, zipCode, options = {})`
- reuse a resolved `storeMetadata` across all keywords when it is provided
- otherwise resolve the nearest store once in the batch wrapper and pass it into each `searchTarget(...)` call

Special notes:

- Target is the best candidate for a slightly smarter batch wrapper because store lookup is separable from product lookup
- even if `searchTarget(...)` remains unchanged, the batch wrapper can avoid repeated `getNearestStore(zipCode)` work when upstream code does not already pass metadata

---

### Tier 2: Good Candidates, But Lower Immediate ROI

These stores can support batch mode, but the wins are smaller than Aldi, Walmart, and Target.

#### Kroger

File: [kroger.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/kroger.js)

Pros:

- has cache and in-flight dedupe
- has rate limiting
- has a clear single-keyword entrypoint

Cons:

- each keyword path still resolves auth token and nearest store inside the request path
- bigger benefit would come from extracting a reusable batch context:
  - fetch auth token once
  - resolve store once
  - run product lookups for many keywords against that context

Recommendation:

- do not start here for v1
- either add a thin batch wrapper later, or do a slightly larger refactor first so batch mode can reuse token and store context

#### Meijer

File: [meijer.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/meijer.js)

Pros:

- has cache and in-flight dedupe
- has rate limiting
- already separates uncached work into `_searchMeijerUncached(...)`

Cons:

- nearest-store lookup is still embedded in the single-keyword path
- main gain would come from a shared batch context similar to Kroger

Recommendation:

- good second-wave candidate after Aldi/Walmart/Target
- worth batching if store-first runs spend noticeable time in Meijer

#### 99 Ranch

File: [99ranch.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/99ranch.js)

Pros:

- has cache and in-flight dedupe
- has rate limiting

Cons:

- store lookup is still performed per keyword
- lower strategic priority than Aldi/Walmart/Target unless profiling shows it is a hotspot

Recommendation:

- reasonable later add
- batch wrapper should resolve nearest store once and reuse it across keyword searches

---

### Tier 3: Not Worth Adding Yet

#### Safeway

File: [safeway.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/safeway.js)

Status:

- current exported scraper is effectively a dummy scraper returning `[]`
- real implementation is commented out

Recommendation:

- do not add batch mode until the real scraper is restored

#### Whole Foods

File: [wholefoods.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/wholefoods.js)

Status:

- current exported scraper is a dummy implementation returning `[]`

Recommendation:

- no batch work until the real scraper exists

#### Andronico's

File: [andronicos.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/andronicos.js)

Status:

- currently returns `[]` and explicitly notes no usable public API

Recommendation:

- no batch work

---

## Recommended Rollout Order

### Phase 1

Add batch entrypoints for:

- Aldi
- Target
- Walmart

Why:

- best mix of real usage, shared utilities, and low implementation risk
- covers both Jina-backed and non-Jina-backed stores
- gives us enough patterns to standardize the API before touching the more stateful Kroger and Meijer flows

### Phase 2

Add batch entrypoints for:

- Kroger
- Meijer
- 99 Ranch

Why:

- they will benefit more from a small shared-context refactor than from a trivial wrapper alone

### Phase 3

Revisit only after scraper restoration:

- Safeway
- Whole Foods
- Andronico's

---

## API Recommendation

Keep the batch API consistent across stores:

```js
async function searchStoreBatch(keywords, zipCode, options = {})
```

For Target, preserve store metadata:

```js
async function searchTargetBatch(keywords, storeMetadata, zipCode, options = {})
```

Suggested behavior:

- return `[]` immediately for empty input
- preserve keyword order in returned results
- use bounded worker concurrency
- keep per-keyword cache behavior unchanged
- do not duplicate scraper logic inside the batch wrapper
- reuse the normal single-keyword scraper internally whenever possible

Suggested default options:

- `concurrency`
- `stopOnRateLimit` for stores with shared fatal cooldown semantics

---

## Shared Utility Opportunity

If we implement batch mode in more than two additional stores, it is worth extracting a shared helper:

- `scrapers/utils/batch-runner.js`

Possible API:

```js
async function runKeywordBatch({
  keywords,
  worker,
  concurrency,
  shouldStop,
  onError,
})
```

Why it helps:

- avoids re-copying the Trader Joe's worker loop
- keeps ordering behavior consistent
- centralizes stop-on-fatal-error behavior
- makes store batch wrappers very small

Trader Joe's could then be migrated onto the same helper after the shared contract is proven.

---

## Integration Recommendation

The main place batch mode should be consumed is the daily scraper, not `ingredient-pipeline.ts`.

Reason:

- `ingredient-pipeline.ts` is store-parallel for one ingredient at a time
- batch mode helps when we are querying one store for many ingredients
- the daily scraper already has that store-first shape

That means the likely integration path is:

1. add batch entrypoints to the store modules
2. export them from [scrapers/index.js](/c:/Users/wmnoo/SecretSauce/scrapers/index.js)
3. update the daily scraper to prefer `search*Batch(...)` when a store supports it
4. keep `ingredient-pipeline.ts` on single-keyword scrapers unless a future call site becomes store-first

---

## Concrete Recommendation

If we want the highest-value next step, implement this PR sequence:

1. Add shared batch runner utility
2. Move Trader Joe's batch orchestration onto it
3. Add `searchAldiBatch`
4. Add `searchTargetBatch`
5. Add `searchWalmartBatch`
6. Export those from [scrapers/index.js](/c:/Users/wmnoo/SecretSauce/scrapers/index.js)
7. Wire the daily scraper to use batch entrypoints when available

This gives us the biggest real execution win with the lowest chance of store-specific regressions.
