# Recipe Ingest Refactor Plan

**Status:** Execution-Ready (post-review)
**Last Updated:** 2026-02-19
**Scope:** Recipe upload, edit, and ingredient standardization pipeline

---

## Review Findings (resolved before implementation)

Six issues were found during a doc-sync pass against current code and `supabase/migrations/fn_upsert_recipe_with_ingredients.sql`. All are resolved in this document. No code has been changed yet.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | High | Problem statement described orphan queue rows from AI writes/enqueue; actual recipe branch only batch-upserts display names and returns empty `standardized` payload (`app/api/ingredients/standardize/route.ts:76`). | Problem Statement §1 rewritten to reflect actual behavior. |
| 2 | High | Unit-keyword filter included all single-word strings, which would pull in single-word ingredient names from `unit_standardization_map`. | Filter moved to SQL RPC (`fn_get_recipe_parser_unit_keywords`) with an anti-join on `standardized_ingredients`. TypeScript filter simplified to a pass-through. |
| 3 | High | Component prose said client fetches `unitKeywords` via `getUnitKeywordsCached()` — a server-only function. | `unitKeywords` are now returned by the `/api/ingredients/parse` response and delivered directly to the UI; no separate client fetch needed. |
| 4 | Medium | `onConfirm` prop typed `{ name, quantity?, units? }` but mapper emitted `{ display_name, quantity, units }`. | Mapper updated to use `name` to match prop contract. |
| 5 | Medium | Integration test path was `tests/integration/...`; repo root is `test/`. | Path corrected to `test/integration/...`. |
| 6 | Medium | Phase 2 used direct `.from('unit_standardization_map')` without aligned DB types. | DB helper updated to use RPC + controlled `any` boundary. |

---

## Executive Summary

The recipe ingest pipeline has two competing write paths that are causing duplicate queue rows, bypassed standardization, and missed enqueue calls. This plan consolidates everything through the existing SQL authority (`fn_upsert_recipe_with_ingredients`), adds a paragraph-parsing endpoint so users can paste ingredient lists from any source, and introduces a preview/edit UI step before saving — bringing NLP-quality recipe ingestion to the upload and edit surfaces without touching the queue worker or the pantry flow.

---

## Context: How the Pipeline Actually Works

Before describing changes, it's worth being precise about what each layer does today, because the TypeScript parser must behave consistently with it.

### The unit vocabulary lives in `unit_standardization_map`

The SQL function `fn_build_unit_regex()` builds its alternation pattern dynamically from `unit_standardization_map` where `confidence_score >= 0.4`. It never uses a hardcoded list. The map currently has **51 rows** covering:

**Canonical `unit_label` values** (from `unit_canonical`):

| Category | Units |
|---|---|
| weight | `oz`, `lb`, `g`, `kg`, `mg` |
| volume | `fl oz`, `ml`, `gal`, `tsp`, `tbsp`, `cup`, `l`, `pt`, `qt` |
| count | `ct`, `each`, `bunch`, `pk`, `dz` |
| other | `unit` |

**Raw aliases in the map** (sample of what `fn_build_unit_regex` includes):

- `oz`, `ounce`, `ounces`, `onz`
- `lb`, `lbs`, `pound`, `pounds`, `lbr`
- `fl oz`, `fluid ounce`, `fo`, `foz`
- `ml`, `milliliter`
- `gal`, `gallon`, `gallons`
- `ct`, `count`, `cnt`
- `each`, `ea`, `pc`, `bag`, `bottle`, `box`, `can`, `clove`, `dash`, `ear`, `fillet`, `head`, `jar`, `leaf`, `piece`, `pieces`, `pinch`, `slice`, `sprig`, `stalk`, `stick`, `round`
- `bunch`, `bunches`
- `g`, `gram`, `grams`, `g pack`, `gram pack`
- `tsp`, `teaspoon`, `teaspoons`
- `tbsp`, `tablespoon`, `tablespoons`, `tblsp`
- `cup`, `cups`
- `kg`, `kilogram`
- `mg`, `milligram`
- `l`, `liter`, `liters`
- `pt`, `pint`, `pints`
- `qt`, `quart`, `quarts`
- `pk`, `pack`, `packs`
- `dz`, `dozen`, `dz dozen`

Note the map also includes **product-name strings** resolved to units (e.g., `egg → ct`, `green onion → bunch`, `avocado oil spray → fl oz`). These exist because scrapers encounter product names that function as implicit units. For the recipe parser, these product-name entries are explicitly **excluded** — we only match unit keyword strings, not ingredient names.

### `fn_parse_unit_from_text` extraction order

The SQL parser takes three inputs: `p_raw_unit` (the `units` field from the ingredient row), `p_raw_unit_param` (a separate rawUnit metadata field used by scrapers), and `p_product_name` (the display name). For recipe ingredients there is no `p_raw_unit_param` — scraper metadata doesn't exist — so only Priorities 2 and 3 fire.

```
Priority 1  rawUnit param — scraper-only, not applicable to recipe UI
Priority 2  Legacy unit field (p_raw_unit):
              a) Strip leading slashes and trailing "/ each|ea|pack"
              b) Extract decimal/integer quantity
              c) Fraction fallback (N/D) if no decimal found
              d) Isolate unit keyword from tail or via unit_standardization_map lookup
Priority 3  Product/display name passes (p_product_name):
              a) Bracketed/dashed: [-–(] qty unit  (scraper-oriented, rarely fires for recipe text)
              b) Mixed fraction: N W/D unit
              c) Decimal/integer + unit
              d) Leading number + word (each fallback)
              e) each/ea explicit keyword fallback → qty 1
```

### `fn_standardize_unit_lookup` maps raw string → `unit_label`

After parsing, the extracted `search_term` is looked up in `unit_standardization_map`. If found exactly, the `standard_unit` (a `unit_label` enum value) and `confidence_score` are returned. If not found exactly, trigram similarity is tried. If still unresolved, `needs_unit_review = true` and the raw string is logged to `unrecognized_inputs_log`. This is the gate that feeds `fn_enqueue_for_review`.

### `fn_resolve_ingredient` maps display name → `standardized_ingredient_id`

Calls `fn_match_ingredient` (6-pass fuzzy matching) and only returns a match for strategies `exact`, `containment`, `high_word_fuzzy`, `high_fuzzy`, `tail`. Anything else → `match_strategy = 'unmatched'` → `needs_ingredient_review = true`.

### `fn_enqueue_for_review` is the queue gate

Called once per ingredient inside `fn_upsert_recipe_with_ingredients`. The `ON CONFLICT (recipe_ingredient_id)` constraint ensures exactly one queue row per recipe ingredient row, regardless of how many times the upsert is called. The function is a no-op when both review flags are false.

### Current queue process (runtime behavior today)

The queue is currently drained by two executors:

- **Local worker loop:** `queue/worker/runner.ts` calls one resolver cycle every `WORKER_INTERVAL_SECONDS` (default `300s`).
- **Nightly fallback workflow:** `.github/workflows/nightly-ingredient-queue.yml` runs batched one-cycle resolver invocations and can optionally requeue failed rows.

Per non-dry run cycle, the worker path is:

1. **Requeue expired leases first:** calls `requeue_expired_ingredient_match_queue(...)` to move stuck `processing` rows back to `pending`.
2. **Atomically claim rows:** calls `claim_ingredient_match_queue(...)` with `limit`, `lease_seconds`, `review_mode`, and `source`.
3. **Process claimed rows in chunks:** chunked by `QUEUE_CHUNK_SIZE`, parallelized by `QUEUE_CHUNK_CONCURRENCY`.
4. **Resolve unit + ingredient:** unit pass 1, ingredient canonicalization, then unit pass 2 when ingredient context can improve low-confidence unit candidates.
5. **Persist terminal state:** `resolved`, `failed`, or `pending` (ingredient resolved but unit still pending).

Important current defaults and filters:

- Local runtime defaults to `QUEUE_SOURCE=scraper` and `QUEUE_REVIEW_MODE=ingredient`.
- Nightly workflow defaults to `queue_source=any` and `queue_review_mode=any`.
- Unit writes require `QUEUE_ENABLE_UNIT_RESOLUTION=true` and confidence ≥ `QUEUE_UNIT_MIN_CONFIDENCE` (default `0.75`), except packaged fallback (`1 unit`) cases.
- Dry runs do not claim or mutate rows; they fetch pending rows and stop after one cycle.

Queue status transitions in code today:

- `pending -> processing` on claim (lease timestamp + `attempt_count` increment).
- `processing -> resolved` when resolution succeeds (`resolved_ingredient_id` and optionally `resolved_unit`/`resolved_quantity` written).
- `processing -> failed` when resolution throws (`last_error` recorded).
- `processing -> pending` via `markIngredientResolvedPendingUnit(...)` when ingredient is resolved but unit remains unresolved.

Canonical safeguard behavior in the worker:

- Canonical remaps pass a double-check gate (`min_confidence=0.85`, `min_similarity=0.96` hard-coded).
- Remap/skip outcomes are logged via `fn_log_canonical_double_check_daily(...)` into `canonical_double_check_daily_stats` (queried through `v_canonical_double_check_drift_daily`).

---

## Problem Statement

### 1. Two paths write recipe ingredients

The upload and edit UIs call `/api/ingredients/standardize` (context=recipe) before saving. The current recipe branch of this route does **not** perform AI resolution or independent enqueue — it batch-upserts display names to `standardized_ingredients` and returns an empty `standardized` payload (`app/api/ingredients/standardize/route.ts:76`). The caller then passes those empty results to `fn_upsert_recipe_with_ingredients`.

This creates two problems:

- **Unnecessary write surface.** The route performs DB writes (batch name upserts) with no useful standardization output, and the empty `standardized` payload means the UI falls back to raw input anyway. The route does nothing valuable for recipe saves and adds an extra write path that could diverge from the SQL function's behavior as the route evolves.
- **Architectural risk.** Because the recipe branch exists, any future change to the route (e.g. re-enabling AI calls, adding enqueue logic) could re-introduce orphan queue rows: rows created with no `recipe_ingredient_id` before the SQL function runs, which would not be caught by the `ON CONFLICT (recipe_ingredient_id)` dedup clause.

### 2. `/api/ingredients/standardize` uses the wrong prompt context for recipes

The AI prompt for `context=recipe` is tuned to reject convenience foods, branded items, and vague descriptions. This is correct for pantry (where "Kraft Mac & Cheese" should normalize to "macaroni and cheese"). For recipes, users should be able to write "2 cans diced tomatoes" and have that pass through as-is — resolution happens later in the queue worker.

### 3. No paragraph ingestion path exists

Users who copy ingredient lists from recipe websites, cookbooks, or apps have to either manually enter each ingredient line-by-line or paste everything into one field. There is no structured way to parse a block like:

```
2 cups all-purpose flour
1 1/2 tsp baking powder
3/4 cup whole milk
2 large eggs
salt and pepper to taste
```

### 4. The TypeScript parser must stay in sync with the DB vocabulary

If we build a client-side parser that uses a hardcoded unit list, it will silently drift from `unit_standardization_map` as new entries are added. The fix is to fetch the live vocabulary from the DB at parse time (or at a well-defined cache boundary) rather than embedding it.

---

## Goals

1. Make `fn_upsert_recipe_with_ingredients` the **only** path that writes `recipe_ingredients` rows and calls `fn_enqueue_for_review` for recipe content.
2. Restrict `/api/ingredients/standardize` to `context=pantry` only.
3. Add `/api/ingredients/parse` — a stateless preview endpoint that returns structured `{quantity, unit, name}` rows from paragraph text, using the live unit vocabulary from the DB.
4. Align TypeScript extraction order to `fn_parse_unit_from_text` Priorities 2 and 3 (Priority 1 is scraper-only).
5. Parser is conservative: extracts quantity/unit/name only. Canonical matching and unit standardization remain in SQL.
6. All saves flow through `recipeDB.upsertRecipeWithIngredients(...)`.
7. Add paragraph paste → preview → edit → save UI mode on upload and edit pages.
8. Add unit tests for parser edge cases and integration tests confirming unresolved rows land correctly in `ingredient_match_queue`.

---

## Architecture After Refactor

```
Upload / Edit UI
       │
       ├─ "Paste list" mode
       │       │
       │       ▼
       │   POST /api/ingredients/parse          ← stateless, no DB writes
       │       │
       │       │  fetches live unit vocab from unit_standardization_map
       │       │  applies fn_parse_unit_from_text extraction logic in TS
       │       │
       │       ▼
       │   Preview table (editable)
       │       │ user adjusts qty / unit / name
       │       │
       └─ Save ──────────────────────────────────────────────────────────┐
                                                                         │
       ├─ "Manual entry" mode                                            │
       │       │                                                         │
       │       └─ Save ───────────────────────────────────────────────── ┤
                                                                         │
                                                            recipeDB.upsertRecipeWithIngredients()
                                                                         │
                                                    fn_upsert_recipe_with_ingredients (SQL)
                                                                         │
                               ┌─────────────────────────────────────────┤
                               │                                         │
                    fn_resolve_ingredient                   fn_parse_unit_from_text
                    fn_match_ingredient                     fn_standardize_unit_lookup
                    (6-pass fuzzy, exact→tail)              (unit_standardization_map lookup)
                               │                                         │
                    recipe_ingredients ◄─────────────────────────────────┘
                               │
                    fn_enqueue_for_review
                    (ON CONFLICT recipe_ingredient_id — exactly once)
                               │
                    ingredient_match_queue
                    source='recipe', needs_ingredient_review / needs_unit_review
                               │
                    Queue worker (nightly / realtime)
                    resolves → backfills product_mappings / recipe_ingredients
```

**Pantry path (entirely unchanged):**
```
Pantry UI → POST /api/ingredients/standardize (context=pantry) → pantry_items
```

---

## Implementation Plan

### Phase 1 — Guard `/api/ingredients/standardize` to pantry-only

**File:** `app/api/ingredients/standardize/route.ts`

Add at the top of the handler, before any DB or AI calls:

```typescript
const { context } = body;
if (context !== 'pantry') {
  return NextResponse.json(
    {
      error: 'This endpoint accepts context=pantry only. Recipe ingredient saves go through fn_upsert_recipe_with_ingredients.',
      code: 'RECIPE_CONTEXT_REJECTED',
    },
    { status: 400 }
  );
}
```

Update inline comments and JSDoc. No DB schema changes required.

---

### Phase 2 — SQL RPC for parser unit vocabulary (new migration)

Add a security-definer function that the DB helper calls. Doing the filtering in SQL keeps the TypeScript simple and ensures product-name exclusion uses a proper anti-join against `standardized_ingredients` rather than an unreliable string heuristic.

**New migration file:** `supabase/migrations/<timestamp>_fn_get_recipe_parser_unit_keywords.sql`

```sql
-- Returns unit keyword strings for the TypeScript ingredient parser.
-- Applies the same confidence/unit filters as fn_build_unit_regex() and
-- excludes single- or multi-word strings that are themselves ingredient
-- display names in standardized_ingredients (product-name entries like
-- "avocado oil spray", "green onion", "egg" that map to a unit but are
-- not meaningful unit tokens for the parser).
-- Results are sorted longest-first so the caller can build a greedy regex.
CREATE OR REPLACE FUNCTION public.fn_get_recipe_parser_unit_keywords()
RETURNS TABLE (keyword text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.raw_input_string
  FROM   unit_standardization_map m
  WHERE  m.standard_unit IS NOT NULL
    AND  m.confidence_score >= 0.4
    AND  LOWER(m.raw_input_string) NOT IN (
           SELECT LOWER(si.display_name)
           FROM   standardized_ingredients si
         )
  ORDER BY LENGTH(m.raw_input_string) DESC, m.raw_input_string ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_recipe_parser_unit_keywords() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_recipe_parser_unit_keywords() TO service_role;
```

---

### Phase 2b — Live unit vocabulary DB helper

The TypeScript parser needs the unit keyword vocabulary from `unit_standardization_map`. We do **not** hardcode it — hardcoding creates drift. Expose the vocabulary through the RPC added above, using a controlled `any` boundary because the RPC return type is not in the generated Supabase TypeScript schema.

**File:** `app/api/ingredients/parse/route.ts` (see Phase 4) calls `getUnitKeywords()` from a new DB helper:

```typescript
// lib/database/unit-standardization-db.ts  (new file)

/**
 * Returns unit keyword strings for the TypeScript ingredient parser.
 * Calls fn_get_recipe_parser_unit_keywords() via RPC — filtering and
 * product-name exclusion are handled in SQL.
 *
 * Uses a controlled `any` boundary because the RPC return type is not
 * in the generated Supabase schema. The narrow cast is intentional.
 */
export async function getUnitKeywords(): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;
  const { data, error } = await supabase
    .rpc('fn_get_recipe_parser_unit_keywords', {});

  if (error) throw error;

  // RPC returns rows { keyword: string }; extract the keyword column.
  return ((data ?? []) as Array<{ keyword: string }>).map(r => r.keyword);
}
```

Cache this result in memory for the process lifetime (or with a short TTL like 1 hour). The vocabulary changes rarely — only when a new scraper encounter adds a row to `unit_standardization_map`.

```typescript
// Simple in-process cache — unit vocab changes at most nightly
let cachedKeywords: string[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getUnitKeywordsCached(): Promise<string[]> {
  if (cachedKeywords && Date.now() < cacheExpiry) return cachedKeywords;
  cachedKeywords = await getUnitKeywords();
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedKeywords;
}
```

---

### Phase 3 — TypeScript paragraph parser (`lib/ingredient-parser.ts`)

This module is **pure TypeScript, no DB calls**. It receives the unit keyword list as a parameter so it is fully testable without a DB connection.

#### Extraction order

The parser mirrors `fn_parse_unit_from_text` Priorities 2 and 3, **in the same order**. Priority 1 (rawUnit param) is scraper-only and does not apply to recipe text.

```
Pass 1  Decimal/integer + known unit keyword  → "2 cups flour", "1.5 oz parmesan", "500ml water"
Pass 2  Mixed fraction + known unit keyword   → "1 1/2 cups milk", "2 3/4 oz cheese"
Pass 3  Plain fraction + known unit keyword   → "3/4 tsp salt", "1/3 cup sugar"
Pass 4  Decimal/integer + no unit (each fallback) → "2 eggs" → qty 2, unit "each"
Pass 5  No quantity detected                  → "salt to taste" → qty null, unit null
```

Note the order of fraction passes relative to the integer pass. This matters: `1 1/2 cups` must match Pass 2 (mixed fraction) before any pass that would consume just the leading `1`.

```typescript
// lib/ingredient-parser.ts

export interface ParsedIngredientRow {
  /** Numeric quantity, or null if none detected. SQL defaults null to 1. */
  quantity: number | null;
  /**
   * Raw unit string as typed, not yet canonicalized.
   * The SQL fn_standardize_unit_lookup will map this to a unit_label.
   * null means no unit keyword was detected.
   */
  unit: string | null;
  /** Trimmed ingredient name — everything after quantity and unit. */
  name: string;
  /** The original unmodified input line, for display in the preview table. */
  raw: string;
}

/**
 * Parse a single ingredient line into {quantity, unit, name}.
 *
 * @param line     - One ingredient line of text.
 * @param unitKeys - Unit keyword strings from unit_standardization_map,
 *                   sorted longest-first. Fetch via getUnitKeywordsCached().
 *
 * Extraction order mirrors fn_parse_unit_from_text in SQL (Priorities 2+3):
 *   Pass 1: decimal/integer + known unit
 *   Pass 2: mixed fraction (N W/D) + known unit
 *   Pass 3: plain fraction (N/D) + known unit
 *   Pass 4: decimal/integer with no unit → each fallback
 *   Pass 5: no quantity → name only
 *
 * Canonical ingredient matching is NOT done here — that is SQL's job
 * via fn_resolve_ingredient / fn_match_ingredient.
 */
export function parseIngredientLine(
  line: string,
  unitKeys: string[]
): ParsedIngredientRow {
  const raw = line;
  // Strip leading list markers: "1.", "2)", "- ", "* "
  let trimmed = line.trim().replace(/^[\d]+[.)]\s*|^[-*•]\s*/, '');
  trimmed = trimmed.trim();
  if (!trimmed) return { quantity: null, unit: null, name: '', raw };

  // Build alternation from live vocabulary (longest-first, already sorted by caller)
  const unitAlt = unitKeys
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|');

  if (!unitAlt) {
    // No unit vocabulary available — return name-only
    return { quantity: null, unit: null, name: trimmed, raw };
  }

  const U = `(?:${unitAlt})`;

  // ── Pass 1: decimal/integer + known unit ──────────────────────────────────
  // Mirrors SQL Priority 3c: (qty unit) from product name
  // Allows no-space between number and unit: "500ml", "2cups"
  // e.g. "2 cups flour", "1.5 oz parmesan", "500ml water"
  let m = trimmed.match(new RegExp(`^(\\d+\\.?\\d*)\\s*(${U})\\s+(.+)$`, 'i'));
  if (m) {
    return { quantity: parseFloat(m[1]), unit: normalizeUnit(m[2]), name: m[3].trim(), raw };
  }

  // ── Pass 2: mixed fraction + known unit ───────────────────────────────────
  // Mirrors SQL Priority 3b: N W/D unit in product name
  // e.g. "1 1/2 cups milk", "2 3/4 oz cheese"
  m = trimmed.match(new RegExp(`^(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)\\s+(${U})\\s+(.+)$`, 'i'));
  if (m && Number(m[3]) !== 0) {
    return {
      quantity: Number(m[1]) + Number(m[2]) / Number(m[3]),
      unit: normalizeUnit(m[4]),
      name: m[5].trim(),
      raw,
    };
  }

  // ── Pass 3: plain fraction + known unit ───────────────────────────────────
  // Mirrors SQL Priority 2c fraction fallback
  // e.g. "3/4 tsp salt", "1/3 cup sugar"
  m = trimmed.match(new RegExp(`^(\\d+)\\s*/\\s*(\\d+)\\s+(${U})\\s+(.+)$`, 'i'));
  if (m && Number(m[2]) !== 0) {
    return {
      quantity: Number(m[1]) / Number(m[2]),
      unit: normalizeUnit(m[3]),
      name: m[4].trim(),
      raw,
    };
  }

  // ── Pass 4: decimal/integer, no unit → each fallback ─────────────────────
  // Mirrors SQL Priority 3d/3e: leading number + word, or each/ea explicit
  // "2 eggs" → qty 2, unit "each"
  // "1 onion, diced" → qty 1, unit "each", name "onion, diced"
  m = trimmed.match(/^(\d+\.?\d*)\s+(.+)$/);
  if (m) {
    // Don't fire if the "name" part starts with a fraction — that would be
    // a mis-parse of "1 1/2 cups" if Pass 2 somehow failed.
    if (!/^\d+\s*\/\s*\d+/.test(m[2])) {
      return { quantity: parseFloat(m[1]), unit: 'each', name: m[2].trim(), raw };
    }
  }

  // ── Pass 5: no quantity detected ──────────────────────────────────────────
  // "salt to taste", "fresh parsley for garnish"
  return { quantity: null, unit: null, name: trimmed, raw };
}

/**
 * Parse a multi-line ingredient block (paragraph or numbered list).
 * Blank lines and comment-only lines (starting with #) are ignored.
 */
export function parseIngredientParagraph(
  text: string,
  unitKeys: string[]
): ParsedIngredientRow[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => parseIngredientLine(line, unitKeys));
}

/** Normalize the matched unit string: trim and lowercase. */
function normalizeUnit(raw: string): string {
  return raw.trim().toLowerCase();
}
```

**Why the unit list is a parameter, not a module-level constant:**  
The vocabulary comes from the DB and must not be hardcoded. By accepting it as a parameter, `parseIngredientLine` and `parseIngredientParagraph` are testable with any list (including the real DB set or a test fixture), and the route handler is responsible for fetching and caching it.

---

### Phase 4 — `/api/ingredients/parse` endpoint

Stateless preview — never writes to the DB. Auth required: returns 401 if the user is not signed in. Returns `unitKeywords` alongside parsed rows so the client has the vocabulary for unit autocomplete without a second fetch.

```typescript
// app/api/ingredients/parse/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { parseIngredientParagraph } from '@/lib/ingredient-parser';
import { getUnitKeywordsCached } from '@/lib/database/unit-standardization-db';
import { getAuthenticatedUser } from '@/lib/auth'; // or equivalent pattern used elsewhere

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const unitKeywords = await getUnitKeywordsCached();
  const rows = parseIngredientParagraph(body.text, unitKeywords);

  return NextResponse.json({ rows, unitKeywords });
}
```

**Response shape:**

```json
{
  "rows": [
    { "quantity": 2,    "unit": "cups", "name": "all-purpose flour",  "raw": "2 cups all-purpose flour" },
    { "quantity": 1.5,  "unit": "tsp",  "name": "baking powder",      "raw": "1 1/2 tsp baking powder" },
    { "quantity": 0.75, "unit": "cup",  "name": "whole milk",         "raw": "3/4 cup whole milk" },
    { "quantity": 2,    "unit": "each", "name": "large eggs",         "raw": "2 large eggs" },
    { "quantity": null, "unit": null,   "name": "salt to taste",      "raw": "salt to taste" }
  ],
  "unitKeywords": ["tablespoons", "tablespoon", "teaspoons", "teaspoon", "cups", "cup", "fl oz", "ounces", "ounce", "oz", "..."]
}
```

**What `unit` means in this response:** it is the raw string as matched (e.g. `"cups"`, `"tsp"`, `"each"`), **not** a `unit_label` enum value. The SQL function `fn_standardize_unit_lookup` will canonicalize it (e.g. `"cups"` → `cup`, `"tsp"` → `tsp`). The UI displays the raw string; the DB canonicalizes it on save.

**Why `unitKeywords` is included in the response:** the preview table needs the vocabulary for unit autocomplete. Returning it here avoids a second round-trip from the client and keeps the vocabulary delivery path entirely server-side (`getUnitKeywordsCached` → parse route → client state).

Add to `docs/api-entrypoints-directory.md`:

| Route | Method | Auth | Responsibility | Dependencies |
|---|---|---|---|---|
| `/api/ingredients/parse` | POST | Required | Stateless paragraph parser. Fetches live unit vocab via `fn_get_recipe_parser_unit_keywords` RPC. Returns parsed rows + unit vocabulary for UI autocomplete. Never writes to DB. | `lib/ingredient-parser.ts`, `lib/database/unit-standardization-db.ts` |

---

### Phase 5 — Remove recipe calls to `/api/ingredients/standardize`

**Files to audit and update:**

- `app/upload-recipe/page.tsx` and its ingredient sub-components
- `app/edit-recipe/[id]/page.tsx` and its ingredient sub-components
- Any shared ingredient form component
- `hooks/recipe/use-recipe.ts` — remove `useStandardizeRecipeIngredients` or any recipe-context standardize call
- `hooks/index.ts` — remove `useStandardizeRecipeIngredients` from barrel export

**Pattern:**

```typescript
// BEFORE
const standardized = await fetch('/api/ingredients/standardize', {
  method: 'POST',
  body: JSON.stringify({ ingredients, context: 'recipe', recipeId }),
});
const { resolved } = await standardized.json();
// ... map resolved → save via recipeDB

// AFTER — pass raw rows directly; SQL handles everything
await recipeDB.upsertRecipeWithIngredients({
  ...recipeFields,
  ingredients: rows.map(row => ({
    display_name: row.name,                // the full text the user typed
    quantity: row.quantity ?? undefined,   // undefined → SQL defaults to 1
    units: row.unit ?? undefined,          // undefined → SQL sets '' → unit_review needed
    // standardized_ingredient_id intentionally omitted — fn_resolve_ingredient runs in SQL
  })),
});
```

The save is immediate. The queue worker resolves unmatched ingredients asynchronously. Users see a confirmation; price data appears once queue rows are processed.

---

### Phase 6 — Paragraph paste UI mode

Add a tab toggle to the ingredient entry section on upload and edit pages:

```
[ Enter manually ]  [ Paste a list ]
```

#### Paste flow

1. User selects "Paste a list" — a `<textarea>` appears.
2. On click of "Preview ingredients" (or on blur with non-empty content), POST to `/api/ingredients/parse`.
3. Replace the textarea with an editable preview table.
4. User can edit any cell inline, remove rows, or add blank rows.
5. "Save Recipe" collects the table state and calls `recipeDB.upsertRecipeWithIngredients(...)`.

No network call happens during editing — all edits are local React state. The final save is exactly one RPC call.

#### Preview table column design

| Qty | Unit | Ingredient Name | |
|-----|------|-----------------|---|
| 2   | cups | all-purpose flour | ✕ |
| 1½  | tsp  | baking powder   | ✕ |
| —   | —    | salt to taste   | ✕ |
| *(blank row)* | | | + |

- **Qty**: number input, blank for null (displayed as `—`)
- **Unit**: text input with autocomplete from the unit keyword list; blank for null
- **Name**: text input, required, always editable
- Rows where `name` is empty are skipped on save

#### Unit autocomplete

The unit autocomplete for the preview table is populated from the `unitKeywords` array returned in the `/api/ingredients/parse` response. The component stores these in state alongside the parsed rows — no additional client fetch is needed.

`unitKeywords` come pre-filtered by the SQL RPC (`fn_get_recipe_parser_unit_keywords`): they already exclude product-name entries and are sorted longest-first. Multi-word product-name entries (`"avocado oil spray"`, `"green onion"`) are not present in the array and will not appear as autocomplete options.

#### Component sketch

```typescript
// components/recipe/ingredient-paragraph-input.tsx
'use client';

import { useState } from 'react';
import type { ParsedIngredientRow } from '@/lib/ingredient-parser';

interface Props {
  onConfirm: (rows: Array<{ name: string; quantity?: number; units?: string }>) => void;
}

export function IngredientParagraphInput({ onConfirm }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ParsedIngredientRow[] | null>(null);
  const [unitKeywords, setUnitKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ingredients/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Parse failed');
      const { rows: parsed, unitKeywords: keywords } = await res.json();
      setRows(parsed);
      setUnitKeywords(keywords ?? []);
    } catch {
      setError('Could not parse ingredients. Please check the format and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (rows !== null) {
    return (
      <IngredientPreviewTable
        rows={rows}
        unitKeywords={unitKeywords}
        onChange={setRows}
        onConfirm={() =>
          onConfirm(
            rows
              .filter(r => r.name.trim())
              .map(r => ({
                name: r.name.trim(),
                quantity: r.quantity ?? undefined,
                units: r.unit ?? undefined,
              }))
          )
        }
        onBack={() => setRows(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Paste your ingredient list below — one ingredient per line.
        Quantities and units will be detected automatically.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={"2 cups all-purpose flour\n1 1/2 tsp baking powder\n3/4 cup whole milk\n2 large eggs\nsalt to taste"}
        rows={8}
        className="w-full border border-border rounded-md p-3 font-mono text-sm bg-background text-foreground resize-y"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        onClick={handleParse}
        disabled={loading || !text.trim()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
      >
        {loading ? 'Detecting ingredients…' : 'Preview ingredients'}
      </button>
    </div>
  );
}
```

```typescript
// components/recipe/ingredient-preview-table.tsx
'use client';

import type { ParsedIngredientRow } from '@/lib/ingredient-parser';

interface Props {
  rows: ParsedIngredientRow[];
  /** Unit keyword strings from parse response — used for unit input autocomplete. */
  unitKeywords: string[];
  onChange: (rows: ParsedIngredientRow[]) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function IngredientPreviewTable({ rows, unitKeywords, onChange, onConfirm, onBack }: Props) {
  const updateRow = (i: number, patch: Partial<ParsedIngredientRow>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const addRow = () =>
    onChange([...rows, { quantity: null, unit: null, name: '', raw: '' }]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review detected ingredients. Edit any field before saving.
        Items with a dashed quantity will be saved as 1 unit.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="pb-2 w-16">Qty</th>
            <th className="pb-2 w-24">Unit</th>
            <th className="pb-2">Ingredient</th>
            <th className="pb-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1 pr-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity ?? ''}
                  placeholder="—"
                  onChange={e =>
                    updateRow(i, {
                      quantity: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="w-full border border-border rounded px-2 py-1 bg-background text-foreground"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="text"
                  value={row.unit ?? ''}
                  placeholder="—"
                  onChange={e => updateRow(i, { unit: e.target.value || null })}
                  className="w-full border border-border rounded px-2 py-1 bg-background text-foreground"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="text"
                  value={row.name}
                  onChange={e => updateRow(i, { name: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1 bg-background text-foreground"
                  required
                />
              </td>
              <td className="py-1">
                <button
                  onClick={() => removeRow(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove ingredient"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <button
          onClick={addRow}
          className="text-sm text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1"
        >
          + Add row
        </button>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-border rounded-md text-sm text-foreground"
        >
          Back to paste
        </button>
        <button
          onClick={onConfirm}
          disabled={rows.every(r => !r.name.trim())}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
        >
          Use these ingredients
        </button>
      </div>
    </div>
  );
}
```

---

### Phase 7 — DB wrapper alignment (`lib/database/recipe-db.ts`)

Ensure `upsertRecipeWithIngredients` passes the correct JSONB shape and does not call any standardization endpoint internally:

```typescript
// lib/database/recipe-db.ts

export interface RecipeIngredientInput {
  display_name: string;           // The user's text — SQL uses this for fn_resolve_ingredient
  quantity?: number;              // Optional — SQL defaults missing quantity to 1
  units?: string;                 // Optional raw unit string — SQL maps via fn_standardize_unit_lookup
  standardized_ingredient_id?: string; // Optional explicit override — SQL skips fn_resolve_ingredient if provided
}

export async function upsertRecipeWithIngredients(params: {
  recipeId?: string;
  title: string;
  authorId: string;
  // ... all other recipe fields matching fn_upsert_recipe_with_ingredients params
  ingredients: RecipeIngredientInput[];
}): Promise<Recipe> {
  const { data, error } = await createServerClient().rpc(
    'fn_upsert_recipe_with_ingredients',
    {
      p_recipe_id:    params.recipeId ?? null,
      p_title:        params.title,
      p_author_id:    params.authorId,
      // ... other fields
      p_ingredients:  params.ingredients,  // Supabase JS client serializes to JSONB
    }
  );
  if (error) throw error;
  return data as Recipe;
}
```

**Critical:** the wrapper must not call `/api/ingredients/standardize` or any AI endpoint. If any current version does this, remove it.

---

## Test Plan

### Unit tests — `lib/ingredient-parser.test.ts`

These tests use a fixed unit keyword list (a snapshot of the DB vocabulary) so they run without a DB connection. The snapshot is committed to `test/fixtures/unit-keywords.json` and should be regenerated when `unit_standardization_map` changes significantly.

```typescript
import { parseIngredientLine, parseIngredientParagraph } from '@/lib/ingredient-parser';
import unitKeywords from '@/test/fixtures/unit-keywords.json';

const parse = (line: string) => parseIngredientLine(line, unitKeywords);

describe('Pass 1: decimal/integer + known unit', () => {
  test('2 cups flour', () =>
    expect(parse('2 cups flour')).toMatchObject({ quantity: 2, unit: 'cups', name: 'flour' }));
  test('1.5 oz parmesan', () =>
    expect(parse('1.5 oz parmesan')).toMatchObject({ quantity: 1.5, unit: 'oz', name: 'parmesan' }));
  test('500ml water (no space)', () =>
    expect(parse('500ml water')).toMatchObject({ quantity: 500, unit: 'ml', name: 'water' }));
  test('3 tbsp olive oil', () =>
    expect(parse('3 tbsp olive oil')).toMatchObject({ quantity: 3, unit: 'tbsp', name: 'olive oil' }));
  test('1 lb ground beef', () =>
    expect(parse('1 lb ground beef')).toMatchObject({ quantity: 1, unit: 'lb', name: 'ground beef' }));
  test('2 cloves garlic', () =>
    expect(parse('2 cloves garlic')).toMatchObject({ quantity: 2, unit: 'cloves', name: 'garlic' }));
});

describe('Pass 2: mixed fraction + known unit', () => {
  test('1 1/2 cups milk', () => {
    const r = parse('1 1/2 cups milk');
    expect(r.quantity).toBeCloseTo(1.5);
    expect(r.unit).toBe('cups');
    expect(r.name).toBe('milk');
  });
  test('2 3/4 oz cheese', () => {
    const r = parse('2 3/4 oz cheese');
    expect(r.quantity).toBeCloseTo(2.75);
    expect(r.unit).toBe('oz');
  });
  test('1 1/3 cups sugar', () => {
    expect(parse('1 1/3 cups sugar').quantity).toBeCloseTo(1.333);
  });
});

describe('Pass 3: plain fraction + known unit', () => {
  test('3/4 tsp salt', () => {
    const r = parse('3/4 tsp salt');
    expect(r.quantity).toBeCloseTo(0.75);
    expect(r.unit).toBe('tsp');
    expect(r.name).toBe('salt');
  });
  test('1/3 cup sugar', () =>
    expect(parse('1/3 cup sugar').quantity).toBeCloseTo(0.333));
  test('1/2 lb ground beef', () => {
    const r = parse('1/2 lb ground beef');
    expect(r.quantity).toBeCloseTo(0.5);
    expect(r.unit).toBe('lb');
    expect(r.name).toBe('ground beef');
  });
});

describe('Pass 4: each fallback (no unit keyword found)', () => {
  test('2 eggs', () =>
    expect(parse('2 eggs')).toMatchObject({ quantity: 2, unit: 'each', name: 'eggs' }));
  test('1 onion, diced', () =>
    expect(parse('1 onion, diced')).toMatchObject({ quantity: 1, unit: 'each', name: 'onion, diced' }));
  test('3 carrots', () =>
    expect(parse('3 carrots')).toMatchObject({ quantity: 3, unit: 'each', name: 'carrots' }));
});

describe('Pass 5: no quantity', () => {
  test('salt to taste', () =>
    expect(parse('salt to taste')).toMatchObject({ quantity: null, unit: null, name: 'salt to taste' }));
  test('fresh parsley for garnish', () =>
    expect(parse('fresh parsley for garnish')).toMatchObject({ quantity: null, unit: null }));
  test('pepper', () =>
    expect(parse('pepper')).toMatchObject({ quantity: null, unit: null, name: 'pepper' }));
});

describe('List marker stripping', () => {
  test('1. 2 cups flour', () =>
    expect(parse('1. 2 cups flour')).toMatchObject({ quantity: 2, unit: 'cups', name: 'flour' }));
  test('2) 1 tsp vanilla', () =>
    expect(parse('2) 1 tsp vanilla')).toMatchObject({ quantity: 1, unit: 'tsp', name: 'vanilla' }));
  test('- 3/4 cup buttermilk', () =>
    expect(parse('- 3/4 cup buttermilk')).toMatchObject({ unit: 'cup', name: 'buttermilk' }));
});

describe('Fraction ordering guards', () => {
  test('mixed fraction not parsed as integer + separate fraction', () => {
    // "1 1/2 cups" must yield qty 1.5, not qty 1 with name "1/2 cups"
    const r = parse('1 1/2 cups milk');
    expect(r.quantity).toBeCloseTo(1.5);
    expect(r.name).toBe('milk');
  });
  test('zero denominator guard does not throw', () => {
    // SQL guards: v_frac_match[2]::numeric != 0 — TS must do the same
    expect(() => parse('1/0 cups water')).not.toThrow();
  });
  test('plain fraction not confused with mixed fraction', () => {
    // "3/4 tsp" should parse as qty 0.75, not as integer 3 + each
    const r = parse('3/4 tsp salt');
    expect(r.quantity).toBeCloseTo(0.75);
    expect(r.unit).toBe('tsp');
  });
});

describe('Unit vocabulary edge cases', () => {
  test('"fl oz" (two-word unit) matches', () =>
    expect(parse('8 fl oz water')).toMatchObject({ quantity: 8, unit: 'fl oz', name: 'water' }));
  test('"dz" abbreviation matches', () =>
    expect(parse('1 dz eggs')).toMatchObject({ quantity: 1, unit: 'dz', name: 'eggs' }));
  test('"bunch" matches', () =>
    expect(parse('1 bunch cilantro')).toMatchObject({ quantity: 1, unit: 'bunch', name: 'cilantro' }));
  test('product-name entries do not match as units', () => {
    // "avocado oil spray" is in unit_standardization_map but should NOT
    // be treated as a unit keyword in the parser
    const r = parse('1 avocado oil spray');
    // Should fall to each-fallback, not match "avocado oil spray" as unit
    expect(r.unit).toBe('each');
    expect(r.name).toContain('avocado');
  });
});

describe('parseIngredientParagraph', () => {
  const block = `
2 cups all-purpose flour
1 1/2 tsp baking powder
3/4 cup whole milk
2 large eggs
salt to taste
  `.trim();

  test('parses 5-line block correctly', () => {
    const rows = parseIngredientParagraph(block, unitKeywords);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ quantity: 2, unit: 'cups', name: 'all-purpose flour' });
    expect(rows[1].quantity).toBeCloseTo(1.5);
    expect(rows[2].quantity).toBeCloseTo(0.75);
    expect(rows[3]).toMatchObject({ quantity: 2, unit: 'each', name: 'large eggs' });
    expect(rows[4]).toMatchObject({ quantity: null, unit: null, name: 'salt to taste' });
  });

  test('blank lines are ignored', () => {
    const rows = parseIngredientParagraph('2 cups flour\n\n1 tsp salt', unitKeywords);
    expect(rows).toHaveLength(2);
  });

  test('comment lines starting with # are ignored', () => {
    const rows = parseIngredientParagraph('# Dry ingredients\n2 cups flour\n1 tsp salt', unitKeywords);
    expect(rows).toHaveLength(2);
  });
});
```

### Integration tests — `test/integration/recipe-ingest.test.ts`

These tests run against a dev/test Supabase instance and verify the end-to-end queue behavior of `fn_upsert_recipe_with_ingredients`.

```typescript
describe('fn_upsert_recipe_with_ingredients → ingredient_match_queue', () => {

  test('unresolved ingredient creates queue row with needs_ingredient_review=true', async () => {
    const recipeId = crypto.randomUUID();
    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId,
      p_title: 'Integration Test',
      p_author_id: TEST_USER_ID,
      // ... minimal required fields ...
      p_ingredients: [{ display_name: 'zarblax extract', quantity: 2, units: 'tsp' }],
    });

    const { data } = await supabase
      .from('ingredient_match_queue')
      .select('needs_ingredient_review, status, source, recipe_ingredient_id')
      .eq('raw_product_name', 'zarblax extract')
      .eq('source', 'recipe')
      .single();

    expect(data!.needs_ingredient_review).toBe(true);
    expect(data!.status).toBe('pending');
    expect(data!.recipe_ingredient_id).not.toBeNull();
  });

  test('high-confidence ingredient does NOT create queue row', async () => {
    // "chicken breast" should match via fn_resolve_ingredient at high confidence
    const recipeId = crypto.randomUUID();
    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId,
      p_title: 'Integration Test 2',
      p_author_id: TEST_USER_ID,
      p_ingredients: [{ display_name: 'chicken breast', quantity: 1, units: 'lb' }],
    });

    const { data } = await supabase
      .from('ingredient_match_queue')
      .select('needs_ingredient_review')
      .eq('source', 'recipe')
      .eq('raw_product_name', 'chicken breast')
      .maybeSingle();

    // Either no row (fn_enqueue_for_review returned early) or row with both flags false
    if (data) {
      expect(data.needs_ingredient_review).toBe(false);
    }
  });

  test('unrecognized unit creates queue row with needs_unit_review=true', async () => {
    const recipeId = crypto.randomUUID();
    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId,
      p_title: 'Integration Test 3',
      p_author_id: TEST_USER_ID,
      p_ingredients: [{ display_name: 'all-purpose flour', quantity: 2, units: 'handfuls' }],
    });

    const { data } = await supabase
      .from('ingredient_match_queue')
      .select('needs_unit_review, raw_unit')
      .eq('source', 'recipe')
      .eq('raw_product_name', 'all-purpose flour')
      .maybeSingle();

    expect(data!.needs_unit_review).toBe(true);
    // raw_unit should carry the unrecognized string for the queue worker
    expect(data!.raw_unit).toBeTruthy();
  });

  test('calling upsert twice does not duplicate queue rows (ON CONFLICT dedup)', async () => {
    const recipeId = crypto.randomUUID();
    const ingredient = [{ display_name: 'zarblax extract', quantity: 1, units: 'tsp' }];

    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId, p_title: 'T', p_author_id: TEST_USER_ID,
      p_ingredients: ingredient,
    });
    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId, p_title: 'T', p_author_id: TEST_USER_ID,
      p_ingredients: ingredient,
    });

    const { data } = await supabase
      .from('ingredient_match_queue')
      .select('id')
      .eq('source', 'recipe')
      .eq('raw_product_name', 'zarblax extract');

    // ON CONFLICT (recipe_ingredient_id) → exactly 1 row
    expect(data).toHaveLength(1);
  });

  test('paragraph parse → upsert → queue landing end-to-end', async () => {
    // Simulate the UI flow: parse paragraph → preview → save
    const res = await fetch(`${NEXT_URL}/api/ingredients/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '2 cups zarblax powder\n1 tsp unknown spice' }),
    });
    const { rows } = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('zarblax powder');

    const recipeId = crypto.randomUUID();
    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId, p_title: 'E2E Test', p_author_id: TEST_USER_ID,
      p_ingredients: rows.map((r: any) => ({
        display_name: r.name,
        quantity: r.quantity,
        units: r.unit,
      })),
    });

    const { data: queueRows } = await supabase
      .from('ingredient_match_queue')
      .select('raw_product_name, needs_ingredient_review')
      .eq('source', 'recipe')
      .in('raw_product_name', ['zarblax powder', 'unknown spice']);

    expect(queueRows!.length).toBeGreaterThan(0);
    expect(queueRows!.every(r => r.needs_ingredient_review)).toBe(true);
  });
});
```

---

## Unit Vocabulary Snapshot (`test/fixtures/unit-keywords.json`)

Commit a snapshot of the unit keywords for offline testing. Generate it with:

```typescript
// scripts/generate-unit-keyword-snapshot.ts
import { getUnitKeywords } from '@/lib/database/unit-standardization-db';
import { writeFileSync } from 'fs';

const keywords = await getUnitKeywords();
writeFileSync('test/fixtures/unit-keywords.json', JSON.stringify(keywords, null, 2));
```

Run this script after any significant change to `unit_standardization_map`. Add it to the CI check or a developer workflow so drift is caught early.

---

## Migration / Rollout Checklist

- [ ] **Pre-work:** Apply new SQL migration `fn_get_recipe_parser_unit_keywords` to dev and production
- [ ] **Phase 1:** Add `context !== 'pantry'` guard to `app/api/ingredients/standardize/route.ts`
- [ ] **Phase 2b:** Create `lib/database/unit-standardization-db.ts` with `getUnitKeywords()` (via RPC) and `getUnitKeywordsCached()`
- [ ] **Phase 2b:** Generate `test/fixtures/unit-keywords.json` from live DB
- [ ] **Phase 3:** Create `lib/ingredient-parser.ts` with `parseIngredientLine` and `parseIngredientParagraph`
- [ ] **Phase 3:** Create `lib/ingredient-parser.test.ts` with full edge-case coverage
- [ ] **Phase 4:** Create `app/api/ingredients/parse/route.ts` (auth required, returns `{ rows, unitKeywords }`)
- [ ] **Phase 5:** Audit all recipe upload/edit components for calls to `/api/ingredients/standardize` — confirm zero recipe-context calls remain
- [ ] **Phase 5:** Update recipe upload and edit pages to call `recipeDB.upsertRecipeWithIngredients()` directly
- [ ] **Phase 5:** Remove `useStandardizeRecipeIngredients` from `hooks/recipe/use-recipe.ts` and `hooks/index.ts` barrel export
- [ ] **Phase 6:** Create `components/recipe/ingredient-paragraph-input.tsx`
- [ ] **Phase 6:** Create `components/recipe/ingredient-preview-table.tsx`
- [ ] **Phase 6:** Integrate paragraph input toggle into upload and edit pages
- [ ] **Phase 7:** Audit `lib/database/recipe-db.ts` — remove any internal standardize calls
- [ ] **Tests:** Run integration tests (`test/integration/recipe-ingest.test.ts`) confirming unresolved rows land in `ingredient_match_queue`
- [ ] **Docs:** Update `docs/api-entrypoints-directory.md` — mark standardize as pantry-only, add parse endpoint
- [ ] **Docs:** Update `docs/database-guide.md` — add note that `fn_upsert_recipe_with_ingredients` is the sole recipe ingest authority
- [ ] **Docs:** Add invariants below to `docs/agent-canonical-context.md`

---

## Canonical Invariants (add to `docs/agent-canonical-context.md`)

```markdown
## Recipe Ingest Invariants

- `fn_upsert_recipe_with_ingredients` is the only function that writes `recipe_ingredients`
  rows and calls `fn_enqueue_for_review` for recipe content. No other code path may do this.

- `/api/ingredients/standardize` accepts only `context=pantry`. The route handler rejects
  any other context with HTTP 400. Recipe context was removed to eliminate duplicate queue rows.

- `/api/ingredients/parse` is stateless. It fetches the live unit vocabulary from
  `unit_standardization_map` (confidence_score >= 0.4, standard_unit NOT NULL) and applies
  the same extraction logic as `fn_parse_unit_from_text` Priorities 2 and 3. It never writes
  to the DB. It is safe to call from UI preview without any side effects.

- The TypeScript parser (`lib/ingredient-parser.ts`) returns {quantity, unit, name} only.
  It does not resolve canonical ingredient IDs or map unit strings to unit_label enum values.
  Both of those operations happen in SQL: fn_resolve_ingredient and fn_standardize_unit_lookup.

- `fn_enqueue_for_review` fires exactly once per recipe ingredient row, inside
  `fn_upsert_recipe_with_ingredients`. The ON CONFLICT (recipe_ingredient_id) constraint
  prevents duplicate queue rows when the upsert is called multiple times for the same recipe.

- Unit keyword vocabulary for the TypeScript parser comes from `unit_standardization_map`
  via `getUnitKeywordsCached()`. It is never hardcoded. A committed snapshot in
  `test/fixtures/unit-keywords.json` is used for offline tests and must be regenerated
  when the map changes significantly.
```

---

## What Is Out of Scope

- **SQL changes to `fn_upsert_recipe_with_ingredients`** — the function is already correct and authoritative. No changes needed.
- **SQL changes to `fn_enqueue_for_review`** — works correctly for recipe rows today.

> **Note:** One SQL addition IS in scope — the new `fn_get_recipe_parser_unit_keywords()` security-definer function (Phase 2 migration). It is a net-new read-only helper; it does not modify any existing function or table.
- **Pantry flow** — entirely unchanged. `/api/ingredients/standardize` continues to serve pantry at full AI quality.
- **Queue worker** — no changes. The queue worker resolves `source='recipe'` rows the same way it resolves scraper rows.
- **Migrating existing `recipe_ingredients` rows** — existing rows are unaffected. Future edits re-run through the SQL function and re-enqueue if resolution has changed.
- **Adding AI/LLM to the parse endpoint** — this is intentionally a pure regex parser. AI resolution happens in the queue worker after save, not at parse time.
