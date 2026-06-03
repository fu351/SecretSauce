# Recipe Recommendation Engine

Heuristics-based recipe recommendation system that scores recipes by pantry ingredient overlap, user preferences, cooking history, and ingredient substitutability (both curated and embedding-based).

## Architecture

```
getRecommendations(config)          # lib/recipe-rec/recommend.ts
  |
  +-- loadPantrySnapshot()          # What the user has
  +-- loadCandidateRecipes()        # Pre-filtered via SQL RPC
  +-- loadUserPreferences()         # Dietary, cuisine, time prefs
  +-- loadUserHistory()             # Recent meals + favorites
  |
  +-- loadEmbeddingSubstitutions()  # pgvector cosine similarity
  |
  +-- scoreRecipe() x N             # Pure scoring function
  |
  +-- filter by minMatchRatio
  +-- sort descending
  +-- return top N
```

All data loading happens in parallel via `Promise.all`. The scorer is a pure function with no DB calls — all data is passed in.

## Files

### Core Engine (`lib/recipe-rec/`)

| File | Lines | Purpose |
|---|---|---|
| `types.ts` | 120 | All interfaces: `RecipeCandidate`, `PantrySnapshot`, `ScoredRecipe`, `ScoreBreakdown`, `RecommendationConfig`, `HeuristicWeights`, `RecipeFilters`, `UserPreferences`, `UserHistory`, `SubstitutionLookup`, `EmbeddingSubstitution` |
| `constants.ts` | 134 | `PANTRY_STAPLES` (21 items), `SUBSTITUTION_MAP` (20+ bidirectional pairs with confidence), `DEFAULT_WEIGHTS`, `DEFAULT_FILTERS`, `STAPLE_PENALTY_FACTOR`, `SUBSTITUTION_CREDIT_FACTOR` |
| `data-loader.ts` | 353 | Five data loading functions that query Supabase. Uses existing DB singletons (`profileDB`) and raw Supabase queries. Includes SQL RPC pre-filtering and embedding substitution loading. |
| `scorer.ts` | 308 | Pure `scoreRecipe()` function implementing 8 weighted heuristics. Deduplicates ingredients by ID, uses Map for O(1) lookups, clamps ratings to valid range. |
| `recommend.ts` | 65 | Orchestrator: loads data in parallel, collects missing ingredient IDs, loads embedding subs, scores all candidates, filters, sorts, returns top N. |
| `index.ts` | 18 | Barrel exports |

### React Hook

| File | Purpose |
|---|---|
| `hooks/recipe/use-recipe-recommendations.ts` | React Query hook wrapping `getRecommendations()`. 5-min stale time. Returns `{ recommendations, isLoading, error, refetch, invalidate }`. |

### Database Migrations

| File | Purpose |
|---|---|
| `supabase/migrations/20260408000000_fn_recipe_candidates_for_pantry.sql` | SQL function that pre-filters recipes by pantry ingredient overlap ratio. Avoids loading all recipes into JS. |
| `supabase/migrations/20260408010000_fn_find_similar_ingredients_for_pantry.sql` | SQL function using pgvector `<=>` cosine distance to find the best pantry substitute for each missing ingredient. One query for all missing ingredients at once. |

Both migrations have been applied to the production Supabase instance.

### Jupyter Notebook

| File | Purpose |
|---|---|
| `notebooks/recipe-rec-testing.ipynb` | Python notebook for interactive testing: data exploration, scoring simulation (Python port), weight sensitivity sweeps, score distribution visualizations, edge case tests, A/B weight comparison. |

### Tests (`test/recipe-rec/`)

| File | Tests | What it covers |
|---|---|---|
| `scorer.test.ts` | 35 | Scoring logic, real Supabase recipe fixtures, substitution degradation curves |
| `data-loader.test.ts` | 17 | Pantry loading, RPC pre-filter, fallback, preferences, history, embedding subs |
| `recommend.test.ts` | 13 | End-to-end pipeline, filters, limits, weights, preferences, diversity, embedding integration |
| **Total** | **65** | |

---

## Scoring Algorithm

Each recipe is scored 0-100 via a weighted sum of 8 heuristic signals:

| Signal | Default Weight | Range | Description |
|---|---|---|---|
| `ingredientMatch` | 0.40 | 0-1 | `matchedCount / uniqueRequiredCount`. Heaviest signal. |
| `quantitySufficiency` | 0.10 | 0-1 | For matched ingredients, compares pantry quantity to recipe quantity (unit-aware). 1.0 if sufficient, 0.5 if partial or incomparable. |
| `expiryUrgency` | 0.10 | 0-1 | Fraction of user's expiring-within-7-days ingredients that this recipe uses. Encourages using up expiring food. |
| `pantryStaple` | 0.05 | 0+ | Credit added back for missing ingredients that are common staples (salt, oil, flour, etc.). Missing staples penalized at 20% of normal. |
| `substitution` | 0.10 | 0+ | Credit for missing ingredients that have a substitute in pantry. Checks static map first, then embedding-based fallback. |
| `preference` | 0.10 | 0-1 | Alignment with user's cuisine preferences, dietary preferences, and cooking time preference. Baseline 0.5. |
| `popularity` | 0.05 | 0-1 | `normRating * 0.7 + logCountFactor * 0.3`. Rating clamped to [1,5]. |
| `diversity` | 0.10 | 0-1 | `1 - penalty`. Penalty for recently-cooked recipes (0.6) or same cuisine (0.1 per occurrence, max 0.3). Favorites get -0.15 offset. |

**Formula**: `totalScore = clamp(0, 100, (sum of weight_i * signal_i) * 100)`

---

## Substitution System

Two-tier substitution lookup:

### Tier 1: Static Map (instant, curated)
`SUBSTITUTION_MAP` in `constants.ts` — 20+ bidirectional pairs with confidence scores:
- lemon <-> lime (0.9)
- butter <-> margarine (0.85)
- milk <-> oat milk (0.8)
- soy sauce <-> tamari (0.9)
- chicken breast <-> chicken thigh (0.9)
- etc.

### Tier 2: Embedding-based (automatic, broad coverage)
For missing ingredients not found in the static map, the system queries `fn_find_similar_ingredients_for_pantry` — a Postgres RPC function that:
1. Takes arrays of missing ingredient IDs and pantry ingredient IDs
2. Joins against `ingredient_embeddings` (pgvector, `nomic-embed-text` model, 1271 embeddings)
3. Computes `1 - (embedding <=> embedding)` cosine similarity
4. Returns the best pantry match per missing ingredient above 0.75 threshold
5. One round trip for all missing ingredients

**Precedence**: Static map always wins. Embedding is only checked if no static pair matches.

**Substitution credit formula**: `confidence * 0.8 / totalIngredients` per substituted ingredient.

---

## Data Loading

### `loadPantrySnapshot(userId)`
- Queries `pantry_items` filtered by `user_id`, excludes expired items
- Builds three data structures for O(1) lookups:
  - `ingredientIds: Set<string>` — for match checking
  - `itemsByIngredientId: Map<string, PantryItem>` — for quantity comparison
  - `expiringWithin7Days: Set<string>` — for expiry urgency

### `loadCandidateRecipes(userId, filters)`
- Calls `fn_recipe_candidates_for_pantry` RPC to pre-filter by pantry overlap ratio in SQL
- Falls back to full recipe load if RPC fails
- Joins `recipe_ingredients` + `standardized_ingredients` for each candidate
- Applies hard filters: cuisine, meal type, difficulty, prep time, dietary tags
- IN clause capped at 2000 IDs

### `loadUserPreferences(userId)`
- Reads `profiles` table via `profileDB.findById()`
- Returns dietary preferences, cuisine preferences, cooking time preference, budget range

### `loadUserHistory(userId, dayRange)`
- Queries `meal_schedule` for recent meals (default 7 days)
- Loads cuisines for recent recipes
- Builds `recentCuisineCounts: Map<string, number>` for O(1) diversity penalty
- Loads `recipe_favorites` for favorite recipe IDs

### `loadEmbeddingSubstitutions(missingIds, pantryIds)`
- Single RPC call to `fn_find_similar_ingredients_for_pantry`
- Short-circuits if either array is empty
- Returns `Map<missingId, { substituteName, similarity }>`

---

## Deduplication

The scorer deduplicates recipe ingredients by `standardizedIngredientId` before scoring. This prevents double-counting when a recipe lists the same ingredient twice (e.g., "2 cups flour" + "1 cup flour for dusting" both mapping to the same standardized flour ID).

---

## React Hook

```ts
const { recommendations, isLoading, error, refetch, invalidate } =
  useRecipeRecommendations({
    userId,
    weights: { ingredientMatch: 0.5, ... },  // optional overrides
    filters: { cuisines: ['italian'], minMatchRatio: 0.5 },  // optional
    limit: 10,  // optional, default 20
  })
```

- Disabled when `userId` is null
- 5-minute stale time (matches app-wide React Query defaults)
- `invalidate()` clears all recommendation caches (call when pantry changes)

---

## Pantry Staples

The following ingredients are considered pantry staples. When missing from a recipe, they receive only 20% of the normal missing-ingredient penalty:

salt, black pepper, pepper, water, cooking oil, vegetable oil, olive oil, sugar, all-purpose flour, flour, butter, garlic, onion, baking soda, baking powder, vanilla extract, soy sauce, vinegar, rice, eggs, milk

---

## Test Coverage

### Scorer Tests (35)
- Empty ingredients, partial/full matches, match ratio accuracy
- Expiry urgency boost
- Pantry staple penalty reduction
- Static substitution credit (lemon -> lime)
- Embedding substitution credit (shallots -> onion)
- Static map precedence over embedding
- Cuisine preference boost
- Diversity penalty for recent recipes
- Popularity signal for rated vs unrated
- Score bounds [0, 100] across all conditions
- Custom weight overrides
- Duplicate ingredient ID deduplication
- **Real Supabase recipe fixtures** (Mediterranean Chickpea Bowl, Smoky Chipotle Chicken Tacos, Coconut Turmeric Lentil Dal, Lemon Tarragon Roasted Cod)
- **Substitution degradation curve** (10 tests): progressive replacement of direct matches with embedding subs at various confidence levels, verifying monotonic score decrease, high > low confidence, cost-per-substitution bounds

### Data Loader Tests (17)
- Pantry snapshot construction (items, sets, maps, expiry detection)
- Null ingredient ID exclusion
- Error handling (empty snapshot on DB failure)
- RPC pre-filter -> recipe + ingredient load chain
- Empty RPC results
- RPC failure fallback to full load
- Ingredient join data validation
- User preferences (populated, empty, null profile)
- User history (recipe dedup, cuisine counts, empty schedule)
- Embedding substitution RPC (success, empty inputs short-circuit, error handling)

### Orchestrator Tests (13)
- Sorted output
- minMatchRatio filtering
- Limit parameter
- Empty candidates
- All loaders called with correct params
- Missing non-staple IDs collected for embedding subs (staples excluded)
- Embedding subs affect scores
- Default and custom weights
- Preference-aligned ranking
- Diversity penalty ranking
- Filter pass-through
- End-to-end ranking with varied match levels

---

## Running Tests

```bash
npx vitest run test/recipe-rec/
```

All 65 tests, ~700ms.

---

## Dependencies

No new npm dependencies. Uses existing:
- `@supabase/supabase-js` — database queries
- `@tanstack/react-query` — React hook
- `vitest` — testing

Python notebook requires: `supabase`, `pandas`, `numpy`, `matplotlib`, `seaborn` (not installed in the Node project).
