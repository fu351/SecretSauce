# Ingredient Standardization Pipeline Audit

**Date:** 2026-05-01  
**Scope:** Full path from recipe input UI → API → Supabase, including the async queue-based background pipeline.

**Branch update:** This branch includes follow-up fixes for several audit findings:

- **`c5b8bfb`** resolved B1–B6: `searchByVariants()` now queries all variants; `getCanonicalNameSample()` returns recent rows; `NON_FOOD_TITLE_TOKENS` extracted to shared module; backfill moved out of `claimPending()`; `allowFallback` defaults to `false`; `max_tokens` raised to 4096.

- **`5a45d80`** split ingredient cleaning by context and slimmed the DB trigger:
  - Created `backend/workers/shared/ingredient-cleaning.ts` as the single source of truth for all cleaning constants and functions.
  - Recipe/pantry inputs now get prep-word stripping (`chopped`, `organic`, `to taste`…); scraper inputs get product-type hoisting, packing-medium stripping, and processing-qualifier stripping.
  - SQL trigger `fn_autolink_recipe_ingredient` slimmed: removed the `fn_clean_product_name` / `fn_strip_units_from_name` dependency (a 6-pass retail product cleaner) and replaced it with five lines of minimal inline SQL (lowercase, unaccent, strip symbols, strip parentheticals). TypeScript now owns deeper context-aware cleaning.

- **`c913e8d`** ported the remaining 5 passes of `fn_strip_units_from_name` into TypeScript for the scraper path:
  - Created `backend/workers/shared/unit-keywords.ts`: fetches `unit_standardization_map` keywords via `fn_get_recipe_parser_unit_keywords` RPC with a 1-hour in-process cache.
  - Added `BRAND_SUFFIX_RE`, `COMPACT_NUTRITION_RE`, `TRAILING_PACK_DESCRIPTOR_RE` (static passes), plus `buildUnitStripRegexes()` for two dynamic passes (trailing separator+unit blocks, fused mid-string units like `"Butter 16oz unsalted"`).
  - `processor.ts` now fetches unit keywords once per batch and applies `cleanScraperProductName()` for scraper-context rows at claim time (after `getIngredientSearchTerm`). The result is automatically persisted back to `cleaned_name` by the existing "persist if changed" block, so retries see the clean name without re-running the logic.

---

## Overview

The standardization pipeline has **two distinct execution paths** depending on the input source:

| Path | Trigger | Standardizer | When |
|------|---------|-------------|------|
| **Pantry (sync)** | `POST /api/ingredients/standardize` | Deterministic only | Real-time on pantry item save |
| **Recipe (async)** | `fn_upsert_recipe_with_ingredients` RPC → DB trigger | Vector fast-path + AI (GPT-4o-mini) | Background worker, nightly or on-demand |

Shared helpers handle cleaning and non-food detection:
- `backend/workers/shared/non-food-signals.ts` — `NON_FOOD_TITLE_TOKENS`, `NON_FOOD_TITLE_PHRASES`, `hasNonFoodTitleSignals()`.
- `backend/workers/shared/ingredient-cleaning.ts` — all cleaning constants and context-aware functions.
- `backend/workers/shared/unit-keywords.ts` — worker-safe fetcher for dynamic unit vocabulary.

---

## Cleaning Architecture

Three distinct cleaning layers handle different stages and input types. After the branch fixes, context-awareness is enforced at every layer.

### Layer 1 — DB Trigger (SQL, insert-time)

**Function:** `fn_autolink_recipe_ingredient` — fires `BEFORE INSERT OR UPDATE` on `recipe_ingredients`.

**What it does now (post-`5a45d80`):**
1. Strip trailing `" - qty unit"` suffix (e.g. `"baby potatoes - 1.5 lb"`)
2. Strip leading `"qty unit "` prefix (e.g. `"2 cups Flour"`)
3. Minimal normalization: `lower(unaccent(...))`, strip `®™©`, strip parentheticals `(...)`, collapse spaces

Previously this called `fn_clean_product_name → fn_strip_units_from_name`, a 6-pass retail product cleaner that was inappropriate for recipe data (brand suffix stripping, pack descriptor stripping, nutrition label stripping). That dependency was removed. The functions remain in the DB and are still called by scraper ingestion flows.

### Layer 2 — TypeScript Cleaning (shared module)

**File:** `backend/workers/shared/ingredient-cleaning.ts`

**Recipe / Pantry path** (`cleanRecipeIngredientName`):
- `normalizeCanonicalName` (lowercase, unaccent, unicode normalize)
- `PREPARATION_AND_MARKETING_RE` — strips `chopped`, `minced`, `organic`, `fresh`, `premium`, etc.
- `OPTIONAL_PHRASE_RE` — strips `"to taste"`, `"if needed"`, `"optional"`, `"divided"`
- `TRAILING_PACKAGING_RE` — strips trailing `"8 oz"`, `"1 lb"`, `"4 ct"`, etc.

**Scraper path** (`cleanScraperProductName`):
- `hoistProductType` — moves product-type suffixes to front (`"Honey Wheat Sandwich Bread"` → `"Sandwich Bread Honey Wheat"`)
- `PACKING_MEDIUM_RE` — strips `"in extra virgin olive oil"`, `"in brine"`, etc.
- `PROCESSING_QUALIFIER_RE` — strips `"cold-pressed"`, `"stone-ground"`, `"flash-frozen"`, etc.
- `BRAND_SUFFIX_RE` — strips trailing `"- Good & Gather"`, `"– Organic Valley"`, etc.
- `trailingSeparatorUnit` (dynamic) — strips `"- 32oz"`, `"- 16.9fl oz"`, `", 8 oz"` using `unit_standardization_map` vocabulary
- `COMPACT_NUTRITION_RE` — strips `"- 14g Protein"`, `", 32g Fat"`, etc.
- `fusedMidUnit` (dynamic) — strips fused mid-string units like `"Butter 16oz unsalted"` → `"Butter unsalted"`
- `TRAILING_PACK_DESCRIPTOR_RE` — strips `"- 6 pack"`, `", 6 pack"`

**Dispatcher:** `cleanIngredientByContext(name, context, unitRegexes?)` routes to the correct path based on `"recipe"`, `"pantry"`, or `"scraper"` context.

### Layer 3 — Queue Processor (TypeScript, claim-time)

**File:** `backend/workers/ingredient-worker/processor.ts` → `resolveIngredientCandidates()`

At claim time, for scraper-context rows:
1. `getWorkerUnitKeywords()` fetches the live unit vocabulary (1hr cached)
2. `buildUnitStripRegexes(keywords)` builds the two dynamic regex objects
3. `cleanScraperProductName(rawSearchTerm, scraperUnitRegexes)` applies all scraper passes
4. If the result differs from the original `cleaned_name`, it is written back to the queue row — retries see the pre-cleaned name

This placement is intentional: only `needs_ingredient_review = true` rows reach this code (rows already resolved skip it), and the persist-back ensures the work is not repeated on retries.

### `unit_standardization_map` — Self-Learning Unit Vocabulary

The two dynamic scraper passes draw from `unit_standardization_map`, a Postgres table with ~175 rows mapping raw unit strings to canonical `unit_label` enum values. It grows automatically: whenever a queue row is resolved with a `resolved_unit`, the `trg_learn_unit_from_queue` trigger fires `fn_learn_unit_mapping()`, which upserts the `raw_unit` string into the table (max 3 words / 25 chars; leading digit stripped to learn just the unit part).

The table is queried via `fn_get_recipe_parser_unit_keywords()` RPC, which returns strings sorted longest-first (so `"fluid ounce"` is tried before `"oz"`) and excludes ambiguous strings (those with `standard_unit IS NULL`). The TypeScript module `unit-keywords.ts` caches the result for 1 hour.

---

## Phase 1 — Recipe Input (UI)

### Entry Points

**New recipe:** [`app/upload-recipe/page.tsx`](app/upload-recipe/page.tsx)  
**Edit recipe:** [`app/edit-recipe/[id]/page.tsx`](app/edit-recipe/[id]/page.tsx)

Both pages share the same two input modes:

1. **Manual form** — `RecipeManualEntryForm` (`components/recipe/forms/recipe-manual-entry-form.tsx`)  
   User types ingredient names directly. The form carries `standardizedIngredientId` and `standardizedName` fields on each ingredient object (can be undefined if never standardized).

2. **Paragraph import** — `RecipeImportParagraph` (`components/recipe/import/recipe-import-paragraph.tsx`)  
   Sends text to `POST /api/recipe-import/paragraph`, gets back raw `{name, quantity, unit}` objects. **No standardization happens here** — ingredients are inserted into the form as-is.

3. **URL import** — `RecipeImportTabs` calls a scraper API. Also returns raw ingredient names.

### Save Trigger

Both pages call:

```ts
// app/upload-recipe/page.tsx:88, app/edit-recipe/[id]/page.tsx:66
const newRecipe = await recipeDB.upsertRecipeWithIngredients({ ... })
```

---

## Phase 2 — Recipe Paragraph Parse API

**Route:** `POST /api/recipe-import/paragraph/route.ts`

```ts
export async function POST(request: NextRequest)
```

**What it does:**
- Validates Clerk auth + premium subscription via `hasAccessToTier("premium")`
- Runs `parseRecipeParagraphWithAI(body.text)` and `extractTimes(body.text)` in parallel
- Returns `{ instructions, ingredients, prepTime?, cookTime? }`

**What it does NOT do:** No ingredient standardization at this step. Raw parsed ingredient names are returned to the client and only saved when the user submits the form.

---

## Phase 3 — Recipe Save: `fn_upsert_recipe_with_ingredients`

**TypeScript caller:** `lib/database/recipe-db.ts:384`

```ts
async upsertRecipeWithIngredients(payload: UpsertRecipePayload): Promise<Recipe | null>
```

**What it does:**
1. Calls `prepareIngredientsForRpc()` to map `RecipeIngredient[]` to `{display_name, standardized_ingredient_id, quantity, units}[]`
2. Calls Supabase RPC `fn_upsert_recipe_with_ingredients` with the full recipe payload including `p_ingredients: Json`
3. The RPC (SQL stored in Supabase, not locally) upserts the `recipes` row and `recipe_ingredients` rows

**Key detail:** `standardized_ingredient_id` is passed through as-is from the form. If the user typed a new ingredient with no prior standardization, it arrives as `null`.

**DB trigger behavior (not visible in local migrations):** A Postgres trigger fires `AFTER INSERT OR UPDATE` on `recipe_ingredients`. When `standardized_ingredient_id` is null, it inserts a row into `ingredient_match_queue` with:
- `source = 'recipe'`
- `raw_product_name = display_name`
- `needs_ingredient_review = false` (note: this is later backfilled — see bug §B4)
- `status = 'pending'`

---

## Phase 4 — Pantry Standardization (Sync Path)

**Route:** `POST /api/ingredients/standardize/route.ts`

```ts
export async function POST(request: NextRequest)
```

**What it does:**
1. Validates `context === "pantry"` — **rejects any non-pantry context with 400** (recipe context is explicitly blocked)
2. Normalizes ingredient inputs (trims, coerces amount to string)
3. Calls `standardizeIngredientsDeterministically(normalizedInputs, context)` — synchronous, no OpenAI
4. Calls `standardizedIngredientsDB.batchGetOrCreate(standardizedItems)` to get/create `standardized_ingredients` rows
5. Updates the pantry item: `pantryItemsDB.update(pantryItemId, { standardized_ingredient_id, standardized_name })`
6. Returns `{ context, standardized: [...] }`

---

## Phase 5 — Deterministic Standardizer

**File:** `backend/workers/standardizer-worker/realtime-standardizer.ts`

```ts
export function standardizeIngredientsDeterministically(
  inputs: IngredientStandardizationInput[],
  _context: IngredientStandardizerContext
): IngredientStandardizationResult[]
```

**Processing steps per ingredient:**

1. `cleanRecipeIngredientName(name)` from `backend/workers/shared/ingredient-cleaning.ts` — normalizes unicode, removes preparation words (chopped, organic, fresh…), optional phrases ("to taste"), and trailing packaging info (oz, lb, ct…)
2. `singularizeCanonicalName(cleaned)` — reduces plurals
3. `applyFormTokenGuard(sourceCanonical, candidateCanonical)` — if the source name contains a "protected form token" (seed, soup, stew, ravioli, chicken, etc.) that the candidate would drop, retains the source form
4. `hasNonFoodTitleSignals(name)` from `backend/workers/shared/non-food-signals.ts` — checks token set against `NON_FOOD_TITLE_TOKENS` and phrase pairs; sets `isFoodItem: false, confidence: 0.05` if triggered
5. `inferCategory(canonicalName)` — keyword-token matching against ordered category buckets (pantry_staples before produce, condiments before produce, etc.)
6. `deterministicConfidence(source, canonical, isFoodItem)` — `0.92` if exact match, `0.84` for ≥2 shared tokens, `0.78` for 1 shared, `0.70` otherwise

No network calls. Always produces a result.

---

## Phase 6 — AI Standardizer

**File:** `backend/workers/standardizer-worker/ingredient-standardizer.ts`

```ts
export async function standardizeIngredientsWithAI(
  inputs: IngredientStandardizationInput[],
  context: IngredientStandardizerContext
): Promise<IngredientStandardizationResult[]>
```

**Processing steps:**

1. `fetchCanonicalIngredients(200)` — queries `standardized_ingredients` for up to 200 canonical names (used as context for the prompt)
2. `cleanIngredientByContext(name, context, unitRegexes?)` from `backend/workers/shared/ingredient-cleaning.ts` — acts as a safety net on already-cleaned names; recipe/pantry inputs strip prep words and packaging noise; scraper inputs apply all scraper passes (see Cleaning Architecture §Layer 2). Primary scraper cleaning happens earlier at claim time in `processor.ts`.
3. Builds prompt via `buildIngredientStandardizerPrompt()` with context-specific rules (`recipe` / `pantry` / `scraper`)
4. Calls OpenAI `gpt-4o-mini` via `callOpenAI(prompt)` with a 20-second timeout
5. Parses JSON response, maps result entries by `id`, normalizes canonical output
6. Applies `hasNonFoodTitleSignals()` override (caps confidence at 0.12 for non-food)
7. On any failure: returns `fallbackResults()` — maps each input to `{ canonicalName: normalizedInput, isFoodItem: false, confidence: 0 }`

**Context rules** (`getIngredientStandardizerContextRules`):
- `recipe` — prepared/branded products acceptable, confidence 0.65–0.85
- `pantry` — convenience foods acceptable, confidence 0.65–0.75
- `scraper` — strictest; meal kits, noisy retail titles → confidence 0.40–0.55; personal-care items → `isFoodItem: false, confidence: 0.0`

---

## Phase 7 — Ingredient Match Queue Pipeline (Async Background)

**Entry point:** `backend/orchestrators/ingredient-match-queue-pipeline/pipeline.ts`

```ts
export async function runIngredientMatchQueuePipeline(
  overrides?: Partial<QueueWorkerConfig>
): Promise<QueueRunSummary>
```

Calls `runIngredientQueueResolver(config)` in `backend/workers/ingredient-worker/processor.ts`.

### Main Loop: `runIngredientQueueResolver()`

```
while (pending rows exist):
  1. requeueExpired()             — reclaim stale leases
  2. claimPending()               — atomic claim via RPC claim_ingredient_match_queue
  3. resolveBatch(rows, config)   — process chunk
```

### `resolveBatch()` per row:

**Step 1 — Validation**
- Skips rows with empty `cleaned_name` and `raw_product_name`, marks them `failed`

**Step 2 — Non-food short-circuit**
- Fetches all `product_mapping_id` values; queries for any that were previously resolved as non-food
- Those rows get immediately `markResolved({ isFoodItem: false })` without hitting AI

**Step 3 — Unit Resolution (first pass)**
- `resolveUnitCandidates()` — rows with `needs_unit_review = true`
- Packaged-item fallback applied if no explicit unit signals (sets `unit = "1 unit"`)
- Remaining rows sent to `runStandardizerProcessor({ mode: "unit" })` via OpenAI

**Step 4 — Ingredient Resolution**
- `resolveIngredientCandidates()` — rows with `needs_ingredient_review = true`
- Groups rows by context (`recipe` vs `scraper`) from `resolveRowStandardizerContext()`
- Deduplicates inputs by lowercased search term within each context
- Checks `localQueueAICache` (file-based cache) first
- **Vector fast-path:** embeds search term, runs cosine search against `ingredient_embeddings`; if `finalScore >= VECTOR_MATCH_HIGH_CONFIDENCE`, skips AI entirely
- **Scraper cleanup:** scraper-context rows now also run through `cleanScraperProductName()` with unit regexes built from `getWorkerUnitKeywords()` / `buildUnitStripRegexes()`, and the normalized value is persisted back to `cleaned_name`
- **LLM context augmentation:** for remaining inputs, gathers mid-confidence vector candidates as `vectorCandidates` hints in the prompt
- Calls `runStandardizerProcessor({ mode: "ingredient", inputs, context })`
- Writes AI results to `localQueueAICache`

**Step 5 — Post-processing per row (AI result → canonical)**
1. `hasNonFoodTitleSignals()` — title-level non-food override
2. `maybeRetainFormSpecificCanonical()` — re-adds dropped protected form tokens
3. `maybeRetainVarietyCanonical()` — preserves learned variety modifiers (e.g. "red bell pepper" not collapsed to "bell pepper")
4. `stripRetailSuffixTokensFromCanonicalName()` — strips brand/retail suffix tokens
5. `isInvalidCanonicalName()` — rejects garbage strings
6. Confidence calibration via `confidenceCalibrator.calibrate(rawConfidence)`
7. `resolveCanonicalWithDoubleCheck()` — semantic double-check against existing canonicals (remaps near-duplicates)
8. Semantic dedup via embedding: if canonical doesn't exist in DB, embeds it and remaps to existing if cosine score `>= SEMANTIC_DEDUP_THRESHOLD`
9. New canonical risk assessment via `assessNewCanonicalRisk()` — blocks low-confidence/high-token canonicals
10. Probation tracking via `localProbationCache.track()` — new canonicals must see `NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES` distinct sources

**Step 6 — DB Write**
- `standardizedIngredientsDB.getOrCreate(canonicalForWrite, category, true)`
- `ingredientMatchQueueDB.markResolved({ resolvedIngredientId, canonicalName, confidence, ... })`

**Step 7 — Unit Resolution (second pass)**
- `rerunUnitCandidatesWithIngredientContext()` — reruns unit resolution for rows that failed or had low confidence, now with ingredient canonical context

**Startup behavior:**
- `runIngredientQueueResolver()` now backfills legacy recipe rows once at startup instead of on every `claimPending()` call.
- `ingredientMatchQueueDB.claimPending()` defaults `allowFallback` to `false`, so the non-atomic fallback path is disabled unless explicitly requested.

---

## Phase 8 — Embedding Pipeline

**File:** `backend/workers/embedding-worker/processor.ts`

```ts
export async function runEmbeddingWorker(config: EmbeddingWorkerConfig): Promise<EmbeddingWorkerRunSummary>
```

Modes: `queue`, `queue-recipe`, `queue-product`, `queue-all`, `probation-embedding`

Embeds canonical ingredient names into `ingredient_embeddings` table. Powers the vector fast-path in Phase 7 Step 4. Typically runs after the ingredient match queue drains.

---

## Database Tables Involved

| Table | Role |
|-------|------|
| `recipes` | Recipe metadata |
| `recipe_ingredients` | Per-recipe ingredients (`display_name`, `standardized_ingredient_id`, `quantity`, `units`) |
| `standardized_ingredients` | Canonical ingredient vocabulary (`canonical_name`, `category`, `is_food_item`) |
| `ingredient_match_queue` | Async work queue; rows from recipes and scrapers awaiting AI resolution |
| `ingredient_embeddings` | Vector embeddings for canonical ingredient names |
| `canonical_creation_probation` | Tracks new-canonical candidate frequency for probation gating |
| `canonical_double_check_daily_stats` | Audit log of semantic double-check remappings |
| `ingredient_confidence_outcomes` | Calibration training data (accepted/rejected per confidence bin) |
| `product_mapping_relink_cache` | Staging table for product-mapping relink phases |

---

### Branch Note

The branch commits below resolve the main audit items, so the findings section is now a mix of fixed issues and remaining risks.

## Bugs and Issues

### B1 — `getCanonicalNameSample()` returns first N rows by insertion order, not a random sample

**File:** [`lib/database/standardized-ingredients-db.ts:423`](lib/database/standardized-ingredients-db.ts#L423)

```ts
const { data, error } = await this.supabase
  .from(this.tableName)
  .select("canonical_name")
  .limit(sampleSize)       // ← no ORDER BY; returns first 200 by heap order
```

The AI standardizer fetches 200 canonical names as prompt context. Without `ORDER BY random()` or equivalent, it consistently receives the oldest 200 entries. Newly created canonicals will never appear in the context window, reducing the AI's ability to converge on recent vocabulary.

**Fix:** Add `.order('id', { ascending: false })` or use `ORDER BY random() LIMIT 200` via a custom RPC.

---

### B2 — `searchByVariants()` silently ignores all variants after the first

**File:** [`lib/database/standardized-ingredients-db.ts:148`](lib/database/standardized-ingredients-db.ts#L148)

```ts
async searchByVariants(variants: string[]): Promise<StandardizedIngredientRow[]> {
  // ...
  .ilike("canonical_name", `%${variants[0]}%`)  // ← only variants[0] is used
```

The method signature accepts an array but only the first element is queried. This is a clear data bug — any callers passing multiple variants get results equivalent to passing a single-element array.

**Fix:** Build an `.or()` filter across all variants, or use `.in()` if exact matching is intended.

---

### B3 — `NON_FOOD_TITLE_TOKENS` / `NON_FOOD_TITLE_PHRASES` duplicated across three files

**Files:**
- `backend/workers/standardizer-worker/ingredient-standardizer.ts:9`
- `backend/workers/standardizer-worker/realtime-standardizer.ts:5`
- `backend/workers/ingredient-worker/processor.ts:57`

All three files define identical `NON_FOOD_TITLE_TOKENS` sets and `NON_FOOD_TITLE_PHRASES` arrays and their own `hasNonFoodTitleSignals()` function. Any update to the token list must be applied in all three places or the pipeline branches will diverge in their food/non-food classification.

**Fix:** Extract to a shared module (e.g., `backend/workers/shared/non-food-signals.ts`) and import from all three.

---

### B4 — `backfillRecipeIngredientReviewFlags()` runs on every `claimPending()` call

**File:** [`lib/database/ingredient-match-queue-db.ts:157`](lib/database/ingredient-match-queue-db.ts#L157)

```ts
async claimPending(params?): Promise<IngredientMatchQueueRow[]> {
  if (reviewMode === "ingredient" && (source === "recipe" || source === "any")) {
    await this.backfillRecipeIngredientReviewFlags()   // ← unconditional UPDATE on every fetch
  }
  // ...
}
```

`backfillRecipeIngredientReviewFlags()` runs a full `UPDATE ... WHERE status='pending' AND source='recipe' AND resolved_ingredient_id IS NULL AND needs_ingredient_review=false` before every batch claim. Under normal operation when there's nothing to backfill, this is still an unnecessary table scan on every cycle.

**Fix:** Move the backfill to a one-time migration or run it only once at pipeline startup, not in the hot claim path.

---

### B5 — Race condition in `claimPending()` fallback path

**File:** [`lib/database/ingredient-match-queue-db.ts:172`](lib/database/ingredient-match-queue-db.ts#L172)

```ts
// Legacy fallback for environments that have not yet applied the claim RPC migration.
const pending = await this.fetchPendingFiltered({ limit, reviewMode, source })
// ← gap: another worker could claim the same rows here
const claimed = await this.markProcessing(pending.map(row => row.id), resolver, ...)
```

The `claim_ingredient_match_queue` RPC uses `SELECT FOR UPDATE SKIP LOCKED` atomically. The fallback path does a non-atomic read then write. Under concurrent workers, two workers could fetch the same pending rows and both process them, leading to duplicate canonical entries or double-writes to the queue.

**Fix:** Document that the fallback is only safe for single-worker deployments, or use `SKIP LOCKED` in a raw SQL fallback query.

---

### B6 — `max_tokens: 1000` in OpenAI call may silently truncate large ingredient batches

**File:** [`backend/workers/standardizer-worker/ingredient-standardizer.ts:457`](backend/workers/standardizer-worker/ingredient-standardizer.ts#L457)

```ts
max_tokens: 1000,
```

A batch of 20 ingredients with a 200-canonical context prompt can easily produce JSON output exceeding 1000 tokens. When the response is truncated, `JSON.parse()` fails and `fallbackResults()` is returned — all ingredients get `isFoodItem: false, confidence: 0`. This silently degrades every ingredient in a batch to zero confidence rather than partially succeeding.

**Fix:** Increase to `4096` tokens, or split batches to keep output small.

---

### B7 — `fetchPendingFiltered()` uses paginated full-scan in application code

**File:** [`lib/database/ingredient-match-queue-db.ts:80`](lib/database/ingredient-match-queue-db.ts#L80)

```ts
const pageSize = Math.max(limit * 2, 100)
const maxPages = 20
// ... paginates through up to 20 × pageSize rows in application code
```

Used as the fallback when `claim_ingredient_match_queue` RPC is unavailable. Fetches rows from the DB in pages and filters in application code. Under a table with thousands of pending rows, this can scan up to `20 × 200 = 4000` rows to find 25 matching ones. No composite index on `(status, source, needs_ingredient_review, needs_unit_review)` is evident.

**Fix:** Push the filter into SQL with a composite index. This method is also called directly in dry-run mode so it affects development workflows.

---

### B8 — `callOpenAI()` logs a warning but does not return `null` on non-JSON response

**File:** [`backend/workers/standardizer-worker/ingredient-standardizer.ts:484`](backend/workers/standardizer-worker/ingredient-standardizer.ts#L484)

```ts
if (!content.startsWith('[') && !content.startsWith('{')) {
  console.warn("[callOpenAI] Response doesn't look like JSON:", content.substring(0, 100))
  // ← does NOT return null; falls through and returns content
}
return content
```

`extractJSON()` then tries regex extraction on the content. If OpenAI returns prose (e.g., a refusal or error message), `extractJSON` may find a spurious `{}` and parse it as an empty result, triggering `fallbackResults()`. The warning is the only signal that the response was invalid.

**Minor issue** — the fallback path recovers, but the log is not treated as an error.

---

### B9 — `upsertRecipeWithIngredients` passes all-null `standardized_ingredient_id` for newly typed ingredients

**File:** [`lib/database/recipe-db.ts:372`](lib/database/recipe-db.ts#L372)

```ts
private prepareIngredientsForRpc(ingredients?) {
  return ingredients.map(ingredient => ({
    display_name: ingredient.name.trim(),
    standardized_ingredient_id: ingredient.standardizedIngredientId ?? null,  // null for new ingredients
    quantity: ingredient.quantity ?? null,
    units: ingredient.unit ?? null,
  }))
}
```

There is no synchronous standardization step before recipe save for the recipe path. Newly typed ingredients always arrive with `standardized_ingredient_id: null` and must go through the async queue pipeline. This means a user can add a recipe, go to the shopping list, and find the ingredients are not yet linked to prices. Depending on queue processing latency this could be minutes to hours.

**Not strictly a bug** — this is the intended async design — but worth documenting as a known UX gap.

---

### B10 — `getOrCreate()` is non-transactional between find and update

**File:** [`lib/database/standardized-ingredients-db.ts:180`](lib/database/standardized-ingredients-db.ts#L180)

```ts
const existing = await this.findByCanonicalName(normalizedCanonicalName)
if (existing) {
  const updatePayload = { ... }
  if (Object.keys(updatePayload).length > 0) {
    await this.supabase.from(this.tableName).update(updatePayload).eq("id", existing.id)
    // ← separate transaction; could overwrite a concurrent writer's category update
  }
  return existing
}
```

The find and update are separate queries. A concurrent worker that upgraded the same row's category between the find and update could have its upgrade overwritten. The conflict guard only applies to the insert path (23505), not the update path.

**Low risk** — the update only happens when `existing.category === 'other'`, so it cannot degrade a good category to a worse one, only upgrade it.

---

## Summary Table

| # | Severity | Status | File | Issue |
|---|----------|--------|------|-------|
| B1 | Medium | ✅ Fixed `c5b8bfb` | `standardized-ingredients-db.ts:423` | Sample fetches oldest 200 rows, not random |
| B2 | High | ✅ Fixed `c5b8bfb` | `standardized-ingredients-db.ts:148` | `searchByVariants()` ignores all variants after index 0 |
| B3 | Medium | ✅ Fixed `c5b8bfb` | 3 files | `NON_FOOD_TITLE_TOKENS` triplicated; divergence risk |
| B4 | Medium | ✅ Fixed `c5b8bfb` | `ingredient-match-queue-db.ts:157` | `backfillRecipeIngredientReviewFlags()` runs every claim cycle |
| B5 | High | ✅ Fixed `c5b8bfb` | `ingredient-match-queue-db.ts:172` | Non-atomic fallback claim path is racy under concurrent workers |
| B6 | Medium | ✅ Fixed `c5b8bfb` | `ingredient-standardizer.ts:457` | `max_tokens: 1000` can silently truncate batches |
| B7 | Low | Open | `ingredient-match-queue-db.ts:80` | `fetchPendingFiltered()` full-scans in application code |
| B8 | Low | Open | `ingredient-standardizer.ts:484` | Non-JSON OpenAI response logs warning but does not return null |
| B9 | Info | By design | `recipe-db.ts:372` | New recipe ingredients always null on save; queue latency is a UX gap |
| B10 | Low | Open | `standardized-ingredients-db.ts:180` | Non-transactional find + update in `getOrCreate()` |
| B11 | Medium | ✅ Fixed `5a45d80` | `fn_autolink_recipe_ingredient` (SQL) | DB trigger called `fn_strip_units_from_name` (retail product cleaner) on recipe data |
| B12 | Medium | ✅ Fixed `5a45d80` | `ingredient-standardizer.ts`, `realtime-standardizer.ts` | Cleaning was not context-aware; recipe rows got scraper-oriented transforms and vice versa |
| B13 | Low | ✅ Fixed `c913e8d` | `processor.ts` | Scraper names reached AI with brand suffixes, pack descriptors, and fused unit tokens intact |
