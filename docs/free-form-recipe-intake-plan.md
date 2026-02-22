# Freeform Recipe Ingredient Ingestion

**Status:** Complete — parser + API + upload UI + edit page + integration tests all done
**Last Updated:** 2026-02-19

---

## What We're Actually Building

A user pastes a raw ingredient block from anywhere — a recipe website, a cookbook photo transcription, a meal-planning app export, or their own notes. The system parses it into structured rows that go straight to `fn_upsert_recipe_with_ingredients`. That SQL function handles everything else: ingredient matching against `standardized_ingredients`, unit standardization against `unit_standardization_map`, and queuing anything uncertain to `ingredient_match_queue` for LLM resolution.

The TypeScript layer only needs to do two things well:

1. **Split the text into lines** (handle numbered lists, bullet points, section headers, blank lines)
2. **Extract quantity + unit from the front of each line**, using the live unit vocabulary from `unit_standardization_map`

Whatever remains after stripping quantity and unit becomes `display_name` — passed as-is to SQL. The SQL function (`fn_resolve_ingredient` → `fn_match_ingredient`) handles the fuzzy match against `standardized_ingredients`. Anything it can't confidently resolve gets a queue row with `source='recipe'` and `needs_ingredient_review=true`. The queue worker resolves it via LLM.

---


# Free-Form Recipe Intake + LLM Resolution Plan

## System Objective

Accept arbitrary user-provided ingredient text from any source and convert it into normalized ingredient records while maintaining:

* Deterministic ingestion
* Database-native matching
* Reproducible unit normalization
* Isolated non-deterministic interpretation

LLMs are not used in the ingestion path and are only invoked as an asynchronous repair mechanism when deterministic matching fails.

---

## High-Level Pipeline

```
User Ingredient Block
        ↓
TypeScript Segmentation + Prefix Extraction
        ↓
fn_upsert_recipe_with_ingredients
        ↓
fn_resolve_ingredient → fn_match_ingredient
        ↓
standardized_ingredients OR ingredient_match_queue
        ↓
LLM Worker Resolution (async)
```

---

## TypeScript Ingestion Responsibilities

The ingestion layer performs only syntactic parsing and is intentionally limited to two responsibilities:

1. Segmentation
2. Prefix Extraction

No semantic interpretation occurs at this stage.

---

## Free-Form Ingredient Segmentation

User-provided ingredient blocks are treated as semi-structured text which may contain:

* Numbered or bulleted lists
* Section headers (e.g. *Dough*, *Filling*, *Sauce*)
* Inline notes (e.g. *softened*, *divided*, *to taste*)
* Parentheticals
* Mixed measurement formats (e.g. `1 1/2`, `1½`, `~2`, `about 3`)
* Multi-ingredient conjunctions (e.g. *salt and pepper to taste*)

The goal of segmentation is not to interpret ingredients, but to extract candidate ingredient expressions suitable for deterministic prefix parsing.

Segmentation proceeds in three stages:

---

### 1. Structural Normalization

The raw block is normalized into a list-like form by:

* Splitting on newline boundaries
* Expanding inline list delimiters (`,`, `;`) where safe
* Removing empty lines
* Removing obvious headers (lines without numeric prefixes or unit-like tokens)

This produces an initial set of candidate rows.

---

### 2. Delimiter-Aware Segmentation

Ingredient rows may be implicitly delimited by punctuation such as commas or periods:

```
salt, pepper, garlic powder
```

However, punctuation is also commonly used within valid measurement prefixes:

```
1.5 cups milk
1,000 g flour
```

Naive splitting on punctuation would corrupt quantity/unit extraction.

To prevent this, segmentation performs punctuation-aware decomposition:

* Commas and periods are treated as list delimiters only when they occur outside a valid measurement prefix
* Numeric punctuation within detected quantity tokens (e.g. decimal points, thousands separators) is preserved
* Periods immediately following unit abbreviations (e.g. `tsp.` or `oz.`) are retained

Example:

```
1.5 cups milk, sugar, and 2 tbsp butter
→
1.5 cups milk
sugar
2 tbsp butter
```

Punctuation splitting is applied only after prefix detection to ensure measurement tokens remain intact.

---

### 3. Line Decomposition

Each candidate row is evaluated for compound expressions such as:

* Multiple ingredients joined by conjunctions
* Shared quantity/unit prefixes (e.g. `2 tbsp butter and olive oil`)

When detected, the row is decomposed into parallel ingredient expressions while preserving shared measurement prefixes:

```
2 tbsp butter and olive oil
→
2 tbsp butter
2 tbsp olive oil
```

---

## Measurement Boundary Detection

Each expression is segmented into:

```
[quantity + unit prefix] | [free-form display_name]
```

Prefix detection is performed using the live vocabulary defined in `unit_standardization_map`.

After removing quantity and unit tokens, the remaining string is treated as a raw `display_name` and forwarded unchanged to SQL.

No semantic interpretation (e.g. ingredient classification, preparation state, or substitution intent) occurs during ingestion.

---

## SQL Resolution Layer

Structured ingredient rows are passed to:

```
fn_upsert_recipe_with_ingredients
```

This function performs:

* Ingredient matching against `standardized_ingredients`
* Unit normalization via `unit_standardization_map`
* Confidence scoring for fuzzy matches

Ingredient resolution is handled downstream by:

```
fn_resolve_ingredient → fn_match_ingredient
```

---

## Unresolved Ingredient Queue

Any ingredient which cannot be confidently resolved is written to:

```
ingredient_match_queue
```

with:

```
source = 'recipe'
needs_ingredient_review = true
```

These rows represent syntactically valid but semantically unresolved inputs.

---

## LLM Resolution Worker

Queued entries are asynchronously processed by an LLM worker which attempts:

* Canonical ingredient identification
* Synonym resolution
* Preparation-state normalization
* Ingredient disambiguation

LLM output is written back to:

```
standardized_ingredients
```

Resolved rows are then replayed through:

```
fn_resolve_ingredient
```

to complete deterministic normalization.

---

## Architectural Guarantee

| Layer        | Responsibility          | Deterministic |
| ------------ | ----------------------- | ------------- |
| Ingestion    | Syntax extraction       | ✓             |
| SQL Matching | Unit + ingredient match | ✓             |
| Queueing     | Confidence gating       | ✓             |
| LLM Worker   | Semantic repair         | ✗             |
| Replay       | Final normalization     | ✓             |

All non-deterministic interpretation is isolated outside the ingestion path, ensuring reproducible recipe intake and database-native normalization.


## The Division of Labor

```
User pastes text
        │
        ▼
lib/ingredient-parser.ts          ← TypeScript, stateless
  - split on newlines
  - strip list markers / section headers
  - regex: extract quantity + unit from line front
  - unit vocab comes from unit_standardization_map (fetched once, cached)
  - remainder of line → display_name
  - returns: { quantity: number|null, unit: string|null, display_name: string }[]
        │
        ▼
Preview table (UI)                ← user can edit qty/unit/name before saving
        │
        ▼
fn_upsert_recipe_with_ingredients ← SQL does all the real work
  - fn_parse_unit_from_text        (normalizes the unit string we pass)
  - fn_standardize_unit_lookup     (maps to unit_label enum via unit_standardization_map)
  - fn_resolve_ingredient          (fuzzy matches display_name → standardized_ingredients)
    └─ fn_match_ingredient         (exact → containment → high_fuzzy → tail → unmatched)
  - fn_enqueue_for_review          (queues anything uncertain)
        │
        ▼
ingredient_match_queue             ← source='recipe', LLM resolves async
```

The parser **does not** try to match ingredient names. It just cleans up the text so the SQL function receives the most useful `display_name` possible.

---

## What the Parser Needs to Handle

Real recipe text looks like this:

```
Chicken Marinade:
2 lbs chicken thighs, boneless skinless
3 cloves garlic, minced
1/4 cup soy sauce
1 1/2 tbsp honey
2 tsp sesame oil
1 tsp fresh ginger, grated
salt and pepper to taste

For the sauce:
3 tbsp hoisin sauce
2 tbsp rice vinegar
1/2 cup chicken broth
```

The parser needs to handle:

- **Section headers** → skip (`"Chicken Marinade:"`, `"For the sauce:"`)
- **Numbered lists** → strip marker (`"1. 2 cups flour"` → `"2 cups flour"`)
- **Bullet points** → strip marker (`"- 1 tsp salt"` → `"1 tsp salt"`)
- **Mixed fractions** → `"1 1/2 tbsp"` → quantity `1.5`, unit `"tbsp"`
- **Plain fractions** → `"1/4 cup"` → quantity `0.25`, unit `"cup"`
- **Decimals** → `"0.5 tsp"` → quantity `0.5`
- **No-space numbers** → `"500ml"` → quantity `500`, unit `"ml"`
- **Descriptor tails** → `"2 lbs chicken thighs, boneless skinless"` → display_name `"chicken thighs, boneless skinless"` (not `"2 lbs chicken thighs, boneless skinless"`)
- **No quantity** → `"salt and pepper to taste"` → quantity `null`, unit `null`, display_name `"salt and pepper to taste"`
- **Bare count** → `"2 eggs"` → quantity `2`, unit `null`, display_name `"eggs"` (no unit keyword found; SQL will handle it)

---

## The Unit Vocabulary Problem

`fn_build_unit_regex()` in SQL builds its alternation dynamically from `unit_standardization_map WHERE standard_unit IS NOT NULL AND confidence_score >= 0.4`. The TypeScript parser needs the same vocabulary. It cannot be hardcoded — the map is live and grows as scrapers encounter new product formats.

The map has 51 rows, but not all are unit keywords. Some are product-name strings that got mapped to a unit through scraper inference:

| raw_input_string | standard_unit | Notes |
|---|---|---|
| `"avocado oil spray"` | `fl oz` | product name, not a unit keyword |
| `"green onion"` | `bunch` | ingredient name, not a unit keyword |
| `"egg"` | `ct` | ingredient name, not a unit keyword |
| `"beef hot dogs"` | `lb` | product name, not a unit keyword |

These must be **excluded** from the recipe parser's unit alternation. If included, a line like `"2 egg yolks"` would match `"egg"` as the unit and produce garbage.

The filter: exclude any entry whose `raw_input_string` contains a space **and** is not a known multi-token unit abbreviation. The known multi-token unit strings are: `fl oz`, `fluid ounce`, `fluid ounces`, `g pack`, `gram pack`, `oz pack`, `dz dozen`, `ea box`, `ea each`.

```typescript
// lib/database/unit-vocab-db.ts

const ALLOWED_MULTI_TOKEN = new Set([
  'fl oz', 'fluid ounce', 'fluid ounces',
  'g pack', 'gram pack', 'oz pack',
  'dz dozen', 'ea box', 'ea each',
]);

export async function getUnitVocab(): Promise<string[]> {
  const { data, error } = await createServerClient()
    .from('unit_standardization_map')
    .select('raw_input_string')
    .not('standard_unit', 'is', null)
    .gte('confidence_score', 0.4);

  if (error) throw error;

  return (data ?? [])
    .map(r => r.raw_input_string as string)
    .filter(s => !s.includes(' ') || ALLOWED_MULTI_TOKEN.has(s))
    .sort((a, b) => b.length - a.length || a.localeCompare(b)); // longest-first
}

// In-process cache — unit vocab changes at most nightly
let _cached: string[] | null = null;
let _expiry = 0;

export async function getUnitVocabCached(): Promise<string[]> {
  if (_cached && Date.now() < _expiry) return _cached;
  _cached = await getUnitVocab();
  _expiry = Date.now() + 60 * 60 * 1000; // 1 hour TTL
  return _cached;
}
```

---

## The Parser (`lib/ingredient-parser.ts`)

The parser accepts the unit vocabulary as a parameter so it can be tested without a DB.

```typescript
// lib/ingredient-parser.ts

export interface ParsedIngredientRow {
  quantity: number | null;  // null if no number found; SQL defaults to 1
  unit: string | null;      // raw matched string, e.g. "tbsp", "cups"; SQL canonicalizes
  display_name: string;     // cleaned remainder — passed to fn_resolve_ingredient
  raw: string;              // original line, for display in preview table
}

/**
 * Parse a multi-line ingredient block into structured rows.
 *
 * @param text      Raw pasted text — any format
 * @param unitVocab Keyword strings from unit_standardization_map, sorted longest-first.
 *                  Fetch via getUnitVocabCached().
 */
export function parseIngredientBlock(
  text: string,
  unitVocab: string[]
): ParsedIngredientRow[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !isSectionHeader(line))
    .map(line => stripListMarker(line))
    .filter(line => line.length > 0)
    .map(line => parseLine(line, unitVocab));
}

/**
 * Parse a single ingredient line.
 * Extraction order matches fn_parse_unit_from_text SQL priorities 2+3.
 */
export function parseLine(line: string, unitVocab: string[]): ParsedIngredientRow {
  const raw = line;

  if (!unitVocab.length) {
    return { quantity: null, unit: null, display_name: line, raw };
  }

  const U = buildUnitAlt(unitVocab);

  // Pass 1: mixed fraction + unit  →  "1 1/2 tbsp honey"
  // Must come before plain-integer pass to avoid consuming just the "1"
  let m = line.match(new RegExp(`^(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)\\s+(${U})(?:\\s+|,\\s*)(.+)$`, 'i'));
  if (m && +m[3] !== 0) {
    return {
      quantity: +m[1] + +m[2] / +m[3],
      unit: m[4].trim().toLowerCase(),
      display_name: cleanName(m[5]),
      raw,
    };
  }

  // Pass 2: plain fraction + unit  →  "1/4 cup soy sauce"
  m = line.match(new RegExp(`^(\\d+)\\s*/\\s*(\\d+)\\s+(${U})(?:\\s+|,\\s*)(.+)$`, 'i'));
  if (m && +m[2] !== 0) {
    return {
      quantity: +m[1] / +m[2],
      unit: m[3].trim().toLowerCase(),
      display_name: cleanName(m[4]),
      raw,
    };
  }

  // Pass 3: decimal/integer + unit  →  "2 lbs chicken", "500ml water", "0.5 tsp"
  // Allows no-space between number and unit ("500ml")
  m = line.match(new RegExp(`^(\\d+\\.?\\d*)\\s*(${U})(?:\\s+|,\\s*)(.+)$`, 'i'));
  if (m) {
    return {
      quantity: parseFloat(m[1]),
      unit: m[2].trim().toLowerCase(),
      display_name: cleanName(m[3]),
      raw,
    };
  }

  // Pass 4: leading integer, no unit found  →  "2 eggs", "3 carrots"
  // No unit keyword matched — pass display_name with qty stripped, unit null.
  // SQL will handle counting units (fn_standardize_unit_lookup will set needs_unit_review).
  m = line.match(/^(\d+\.?\d*)\s+(.+)$/);
  if (m) {
    // Guard: don't fire if remainder looks like "N/D unit" (mixed fraction that failed earlier)
    if (!/^\d+\s*\/\s*\d+\s+\S/.test(m[2])) {
      return {
        quantity: parseFloat(m[1]),
        unit: null,
        display_name: cleanName(m[2]),
        raw,
      };
    }
  }

  // Pass 5: no quantity at all  →  "salt and pepper to taste"
  return { quantity: null, unit: null, display_name: cleanName(line), raw };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A line is a section header if it:
 *   - ends with a colon: "For the sauce:", "Marinade:"
 *   - is ALL CAPS with no digits: "INGREDIENTS", "WET INGREDIENTS"
 *   - starts with # comment marker
 */
function isSectionHeader(line: string): boolean {
  if (line.startsWith('#')) return true;
  if (/^[A-Z\s]+$/.test(line) && !/\d/.test(line) && line.length > 2) return true;
  if (/^[^:]+:\s*$/.test(line)) return true;
  return false;
}

/** Strip leading list markers: "1.", "2)", "- ", "* ", "• " */
function stripListMarker(line: string): string {
  return line
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .trim();
}

/** 
 * Clean the display_name remainder:
 * - Strip leading comma artifacts: ", minced" → "garlic, minced" stays intact
 *   but a name that starts with ", " after unit stripping gets the comma removed.
 * - Normalize whitespace.
 */
function cleanName(s: string): string {
  return s.trim().replace(/^,\s*/, '').trim();
}

/** Build regex alternation from vocab, longest-first, with metachar escaping. */
function buildUnitAlt(vocab: string[]): string {
  return vocab
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|');
}
```

---

## The Parse API Endpoint

```typescript
// app/api/ingredients/parse/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { parseIngredientBlock } from '@/lib/ingredient-parser';
import { getUnitVocabCached } from '@/lib/database/unit-vocab-db';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const vocab = await getUnitVocabCached();
  const rows = parseIngredientBlock(body.text, vocab);

  return NextResponse.json({ rows });
}
```

**Response example** for the chicken marinade block above:

```json
{
  "rows": [
    { "quantity": 2,    "unit": "lbs",  "display_name": "chicken thighs, boneless skinless" },
    { "quantity": 3,    "unit": "cloves","display_name": "garlic, minced" },
    { "quantity": 0.25, "unit": "cup",  "display_name": "soy sauce" },
    { "quantity": 1.5,  "unit": "tbsp", "display_name": "honey" },
    { "quantity": 2,    "unit": "tsp",  "display_name": "sesame oil" },
    { "quantity": 1,    "unit": "tsp",  "display_name": "fresh ginger, grated" },
    { "quantity": null, "unit": null,   "display_name": "salt and pepper to taste" },
    { "quantity": 3,    "unit": "tbsp", "display_name": "hoisin sauce" },
    { "quantity": 2,    "unit": "tbsp", "display_name": "rice vinegar" },
    { "quantity": 0.5,  "unit": "cup",  "display_name": "chicken broth" }
  ]
}
```

Each row goes to `fn_upsert_recipe_with_ingredients` as-is. The SQL function:
- maps `"lbs"` → `lb` via `fn_standardize_unit_lookup` / `unit_standardization_map`
- maps `"cloves"` → `each` via `unit_standardization_map`  
- fuzzy-matches `"chicken thighs, boneless skinless"` → `chicken thigh` via `fn_match_ingredient`
- fuzzy-matches `"soy sauce"` → `soy sauce` (exact hit)
- queues `"salt and pepper to taste"` with `needs_ingredient_review=true` because `fn_resolve_ingredient` returns `unmatched`

---

## What the SQL Will Resolve vs. What Goes to Queue

Given the 136 ingredients currently in `standardized_ingredients` and the 51-row `unit_standardization_map`, here's what typical recipe lines will produce:

| Line | After parse | SQL outcome |
|---|---|---|
| `2 lbs chicken thighs` | qty 2, unit "lbs", name "chicken thighs" | `lbs→lb` ✓, matches `chicken thigh` (containment) ✓ |
| `3 cloves garlic, minced` | qty 3, unit "cloves", name "garlic, minced" | `cloves→each` ✓, matches `garlic` (containment) ✓ |
| `1/4 cup soy sauce` | qty 0.25, unit "cup", name "soy sauce" | `cup→cup` ✓, matches `soy sauce` (exact) ✓ |
| `1 1/2 tbsp honey` | qty 1.5, unit "tbsp", name "honey" | `tbsp→tbsp` ✓, matches `honey` (exact) ✓ |
| `pinch of cayenne` | qty null, unit null, name "pinch of cayenne" | `fn_resolve_ingredient("pinch of cayenne")` → likely unmatched → **queued** |
| `salt and pepper to taste` | qty null, unit null, name "salt and pepper to taste" | → unmatched → **queued** |
| `2 sprigs fresh thyme` | qty 2, unit "sprigs", name "fresh thyme" | `sprigs→each` ✓, matches `thyme` (containment) ✓ |
| `8 oz block cheddar` | qty 8, unit "oz", name "block cheddar" | `oz→oz` ✓, matches `cheddar cheese` (fuzzy) — might queue |

The "might queue" cases and the definite queue cases are exactly where the LLM queue adds value. The queue worker already handles `source='recipe'` rows. Nothing new needed there.

---

## The UI

One toggle on the ingredient entry section. When "Paste" is selected:

```
┌─────────────────────────────────────────────────────┐
│  Enter manually  │  Paste a list  ←selected          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ 2 lbs chicken thighs, boneless skinless       │  │
│  │ 3 cloves garlic, minced                       │  │
│  │ 1/4 cup soy sauce                             │  │
│  │ salt and pepper to taste                      │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [  Preview ingredients  ]                          │
└─────────────────────────────────────────────────────┘
```

After parsing:

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to paste                                         │
├──────┬──────────┬───────────────────────────────────┬───┤
│ Qty  │ Unit     │ Ingredient                        │   │
├──────┼──────────┼───────────────────────────────────┼───┤
│  2   │ lbs      │ chicken thighs, boneless skinless │ ✕ │
│  3   │ cloves   │ garlic, minced                    │ ✕ │
│ 0.25 │ cup      │ soy sauce                         │ ✕ │
│  —   │ —        │ salt and pepper to taste          │ ✕ │
├──────┴──────────┴───────────────────────────────────┴───┤
│  + Add row              [ Use these ingredients ]        │
└──────────────────────────────────────────────────────────┘
```

Each field is editable inline. "Use these ingredients" sends the rows to `fn_upsert_recipe_with_ingredients`. The SQL handles all matching and queuing from there.

Rows with `quantity: null` show a `—` placeholder in the Qty field. Users can fill in a number if they want, or leave it — SQL defaults to 1.

---

## What Goes to `fn_upsert_recipe_with_ingredients`

The payload shape the SQL function reads from each JSONB item:

```typescript
interface IngredientPayload {
  display_name: string;           // required — used by fn_resolve_ingredient
  quantity?: number;              // optional — SQL defaults to 1 if absent/null
  units?: string;                 // optional raw string — SQL maps via unit_standardization_map
  standardized_ingredient_id?: string; // optional explicit override — skips fn_resolve_ingredient
}
```

The parse result maps directly to this — no transformation layer needed:

```typescript
const payload = parsedRows
  .filter(r => r.display_name.trim().length > 0)
  .map(r => ({
    display_name: r.display_name,
    ...(r.quantity !== null && { quantity: r.quantity }),
    ...(r.unit !== null && { units: r.unit }),
  }));

await recipeDB.upsertRecipeWithIngredients({ ...recipeFields, ingredients: payload });
```

---

## Tests

### Unit tests (`lib/ingredient-parser.test.ts`)

Uses a fixture snapshot of the unit vocabulary for offline runs.

```typescript
// Generate snapshot: npx tsx scripts/generate-unit-vocab-snapshot.ts
import vocab from '@/test/fixtures/unit-vocab.json';
import { parseLine, parseIngredientBlock } from '@/lib/ingredient-parser';

const p = (line: string) => parseLine(line, vocab);

// Fractions — must resolve before integer fallback
test('mixed fraction', () => expect(p('1 1/2 tbsp honey')).toMatchObject({ quantity: 1.5, unit: 'tbsp', display_name: 'honey' }));
test('plain fraction', () => expect(p('1/4 cup soy sauce')).toMatchObject({ quantity: 0.25, unit: 'cup', display_name: 'soy sauce' }));
test('mixed fraction not split into integer + separate fraction', () => {
  const r = p('1 1/2 cups milk');
  expect(r.quantity).toBeCloseTo(1.5);
  expect(r.display_name).toBe('milk'); // not "1/2 cups milk"
});

// Descriptor tails are preserved in display_name
test('descriptor tail preserved', () => expect(p('2 lbs chicken thighs, boneless skinless')).toMatchObject({ quantity: 2, unit: 'lbs', display_name: 'chicken thighs, boneless skinless' }));
test('comma after unit stripped cleanly', () => expect(p('3 cloves garlic, minced')).toMatchObject({ unit: 'cloves', display_name: 'garlic, minced' }));

// No quantity
test('no quantity', () => expect(p('salt and pepper to taste')).toMatchObject({ quantity: null, unit: null, display_name: 'salt and pepper to taste' }));

// No unit keyword
test('bare count — no unit', () => expect(p('2 eggs')).toMatchObject({ quantity: 2, unit: null, display_name: 'eggs' }));
test('bare count with descriptor', () => expect(p('3 large carrots, peeled')).toMatchObject({ quantity: 3, unit: null, display_name: 'large carrots, peeled' }));

// No-space number+unit
test('no space number+unit', () => expect(p('500ml water')).toMatchObject({ quantity: 500, unit: 'ml', display_name: 'water' }));

// Section headers and markers stripped
test('section header filtered', () => {
  const rows = parseIngredientBlock('For the sauce:\n2 tbsp soy sauce', vocab);
  expect(rows).toHaveLength(1);
  expect(rows[0].display_name).toBe('soy sauce');
});
test('numbered list marker stripped', () => expect(p('1. 2 cups flour')).toMatchObject({ quantity: 2, unit: 'cups', display_name: 'flour' }));
test('bullet marker stripped', () => expect(p('- 1 tsp salt')).toMatchObject({ quantity: 1, unit: 'tsp', display_name: 'salt' }));

// Zero denominator guard
test('zero denominator does not throw', () => expect(() => p('1/0 cups water')).not.toThrow());

// Product-name entries from unit_standardization_map do NOT match as units
test('"egg" is not treated as a unit keyword', () => {
  // "egg" maps to ct in the map, but is a product name — should not be a unit alternation match
  // "2 egg yolks" → qty 2, unit null (bare count fallback), display_name "egg yolks"
  const r = p('2 egg yolks');
  expect(r.unit).toBeNull(); // "egg" filtered from vocab
  expect(r.display_name).toBe('egg yolks');
});
```

### Integration test — queue landing

```typescript
// tests/integration/recipe-ingest.test.ts

test('parsed rows from unrecognized ingredients land in queue', async () => {
  // Parse a block containing a known ingredient and an unknown one
  const res = await fetch(`${BASE_URL}/api/ingredients/parse`, {
    method: 'POST',
    body: JSON.stringify({ text: '1 lb chicken breast\n2 tsp zarblax powder' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const { rows } = await res.json();

  const recipeId = crypto.randomUUID();
  await supabase.rpc('fn_upsert_recipe_with_ingredients', {
    p_recipe_id: recipeId,
    p_title: 'Queue Test',
    p_author_id: TEST_USER_ID,
    p_ingredients: rows.map((r: any) => ({
      display_name: r.display_name,
      ...(r.quantity !== null && { quantity: r.quantity }),
      ...(r.unit !== null && { units: r.unit }),
    })),
  });

  // Known ingredient should resolve, not queue
  const { data: knownQueue } = await supabase
    .from('ingredient_match_queue')
    .select('needs_ingredient_review')
    .eq('raw_product_name', 'chicken breast')
    .eq('source', 'recipe')
    .maybeSingle();

  if (knownQueue) expect(knownQueue.needs_ingredient_review).toBe(false);

  // Unknown ingredient must queue
  const { data: unknownQueue } = await supabase
    .from('ingredient_match_queue')
    .select('needs_ingredient_review, status, recipe_ingredient_id')
    .eq('raw_product_name', 'zarblax powder')
    .eq('source', 'recipe')
    .single();

  expect(unknownQueue!.needs_ingredient_review).toBe(true);
  expect(unknownQueue!.status).toBe('pending');
  expect(unknownQueue!.recipe_ingredient_id).not.toBeNull();
});

test('upsert twice does not create duplicate queue rows', async () => {
  const recipeId = crypto.randomUUID();
  const ingredient = [{ display_name: 'zarblax powder', quantity: 2, units: 'tsp' }];

  for (let i = 0; i < 2; i++) {
    await supabase.rpc('fn_upsert_recipe_with_ingredients', {
      p_recipe_id: recipeId, p_title: 'T', p_author_id: TEST_USER_ID,
      p_ingredients: ingredient,
    });
  }

  const { data } = await supabase
    .from('ingredient_match_queue')
    .select('id')
    .eq('source', 'recipe')
    .eq('raw_product_name', 'zarblax powder');

  // ON CONFLICT (recipe_ingredient_id) guarantees exactly one row
  expect(data).toHaveLength(1);
});
```

---

## Rollout Checklist

- [x] Create `lib/database/unit-vocab-db.ts` — implemented as `lib/database/unit-standardization-db.ts`
      - Uses SQL RPC `fn_get_recipe_parser_unit_keywords` instead of direct table query
      - Equivalent exported API: `getUnitKeywordsCached()` (1-hr TTL in-process cache)
      - Product-name filtering handled in SQL via anti-join against `standardized_ingredients`
- [x] Generate `test/fixtures/unit-vocab.json` from live DB — done as `test/fixtures/unit-keywords.json`
- [x] Create `lib/ingredient-parser.ts` — `parseIngredientLine`, `parseIngredientParagraph`
      - Naming differs from plan (`parseLine` → `parseIngredientLine`, `parseIngredientBlock` → `parseIngredientParagraph`)
      - Field name differs: plan uses `display_name`, implementation uses `name`
      - `isSectionHeader` not implemented — currently only `#` prefix and blank lines are skipped
        (lines ending in `:` and ALL-CAPS headers are passed through to the parser rather than dropped)
- [x] Create `lib/ingredient-parser.test.ts` — 50 tests, all passing
- [x] Create `app/api/ingredients/parse/route.ts` — auth-guarded (`auth()` from Clerk), returns `{ rows, unitKeywords }`
      - Note: plan omitted auth; added per existing API conventions
- [x] Create `components/recipe/ingredient-paragraph-input.tsx` — done as `components/recipe/import/recipe-import-paragraph.tsx`
      - Collocated with other import components rather than at `components/recipe/` root
      - Shows parsed results in three visual groups: "Parsed with qty/unit", "May contain multiple ingredients" (conjunction), "Name only"
      - Client-side pre-processing removed — sentence splitting now handled by `parseRecipeText` in the parser
- [ ] Create `components/recipe/ingredient-preview-table.tsx` — not built as a separate component
      - Table is inline in `recipe-import-paragraph.tsx`; extract if reuse is needed
- [x] Wire paste mode toggle into **upload** page (`app/upload-recipe/page.tsx`) — third tab "Paste Ingredients"
- [x] Wire paste mode toggle into **edit** page (`app/edit-recipe/[id]/page.tsx`)
      - Two-tab layout: "Edit Recipe" (form) + "Paste Ingredients"
      - Accepted ingredients are merged with existing recipe ingredients; form is re-keyed to reinitialize
- [x] Integration tests in `test/integration/recipe-ingest.test.ts` — 30 tests, all passing
      - Covers: structured lists, instruction-style prose, step-marker stripping, section-header filtering, deduplication, "and" conjunction behavior, mixed format, edge cases
- [x] Update `docs/api-entrypoints-directory.md` — `/api/ingredients/parse` added

### Outstanding gaps vs plan

1. **`display_name` vs `name`** — plan uses `display_name` throughout; implementation uses `name` (matches `BaseIngredient` type). When mapping parsed rows to the `fn_upsert_recipe_with_ingredients` payload, ensure the field is mapped to `display_name`.
2. **Greedy name capture from instruction prose** — when `scanEmbedded` extracts a qty+unit from an instruction sentence, the name group (`[^,;.\n]+`) captures everything up to the first punctuation. For "Add 3 tbsp olive oil to the pan." the name is "olive oil to the pan" rather than "olive oil". SQL's `fn_match_ingredient` handles the fuzzy match, so this is not a correctness issue but affects preview readability.
3. **Second ingredient in "and"-joined pairs** — "butter and 1 tbsp oil" → `trimName` extracts "butter" cleanly, but "1 tbsp oil" is consumed by the first match's name group and not separately extracted. `trimName` only removes ` and <digit>...` suffixes. Separate extraction would require a second-pass scan on the trimmed-off suffix.

---

## Not In Scope

- Changing any SQL — `fn_upsert_recipe_with_ingredients`, `fn_resolve_ingredient`, `fn_enqueue_for_review` are all correct as-is
- Changing the queue worker — it already handles `source='recipe'` rows
- Restricting `/api/ingredients/standardize` — that's a separate cleanup
- AI at parse time — the queue worker handles LLM resolution after save