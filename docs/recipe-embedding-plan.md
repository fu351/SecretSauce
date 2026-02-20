# Recipe Instruction Vector Embeddings

**Status:** Planning
**Last Updated:** 2026-02-19

---

## What We're Building

When a recipe is saved, queue each instruction step for vector embedding using OpenAI `text-embedding-3-small`. Simultaneously embed all `standardized_ingredients` canonical names. Run cosine similarity between instruction embeddings and ingredient embeddings to automatically discover and link ingredients that appear semantically in the recipe steps — without regex parsing.

---

## High-Level Pipeline

```
Recipe saved (upload or edit page)
        ↓
fn_recipe_instruction_upsert (new SQL RPC)
  ├── calls fn_upsert_recipe_with_ingredients (existing — unchanged)
  ├── upserts rows into recipe_instruction_embeddings (embedding = null)
  └── inserts recipe_id into recipe_embedding_queue
        ↓
Fly.io queue worker (existing process)
  ├── ingredient_match_queue processor (unchanged)
  └── recipe_embedding_queue processor (new)
        ↓
embedding-processor.ts
  1. Claim recipe from queue (lease-based)
  2. Embed each instruction step → store in recipe_instruction_embeddings
  3. Embed any standardized_ingredients with null name_embedding
  4. Cosine similarity: instruction embeddings vs ingredient embeddings
  5. similarity ≥ 0.85 → auto-link as recipe ingredient
  6. Call fn_upsert_recipe_with_ingredients with matched ingredients
  7. Mark queue entry done
```

---

## Database Changes

### Migration 1 — Enable pgvector

```sql
create extension if not exists vector;
```

### Migration 2 — New tables and columns

```sql
-- Embedding column on standardized_ingredients
alter table standardized_ingredients
  add column name_embedding vector(1536);

create index si_name_embedding_hnsw on standardized_ingredients
  using hnsw (name_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Per-step instruction embeddings
create table recipe_instruction_embeddings (
  id               uuid        primary key default gen_random_uuid(),
  recipe_id        uuid        not null references recipes(id) on delete cascade,
  step_index       int         not null,   -- 0-based index into instructions_list
  instruction_text text        not null,
  embedding        vector(1536),           -- null = pending embedding
  embedded_at      timestamptz,
  created_at       timestamptz default now(),
  unique(recipe_id, step_index)
);

create index rie_embedding_hnsw on recipe_instruction_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index rie_recipe_id_idx on recipe_instruction_embeddings(recipe_id);

-- Separate queue table for embedding work
create table recipe_embedding_queue (
  id                          uuid        primary key default gen_random_uuid(),
  recipe_id                   uuid        not null references recipes(id) on delete cascade,
  status                      text        not null default 'pending'
                                          check (status in ('pending','processing','done','failed')),
  attempt_count               int         not null default 0,
  last_error                  text,
  created_at                  timestamptz default now(),
  processing_started_at       timestamptz,
  processing_lease_expires_at timestamptz,
  processed_at                timestamptz,
  unique(recipe_id)
);

create index req_pending_idx on recipe_embedding_queue(status, created_at)
  where status in ('pending', 'processing');
```

### Migration 3 — SQL functions

```sql
-- Claim batch from embedding queue (mirrors fn_claim_ingredient_match_queue_batch)
create or replace function fn_claim_recipe_embedding_work(
  p_batch_limit   int default 5,
  p_lease_seconds int default 300
) returns setof recipe_embedding_queue as $$
  update recipe_embedding_queue
  set
    status                      = 'processing',
    processing_started_at       = now(),
    processing_lease_expires_at = now() + (p_lease_seconds * interval '1 second'),
    attempt_count               = attempt_count + 1
  where id in (
    select id from recipe_embedding_queue
    where status = 'pending'
       or (status = 'processing' and processing_lease_expires_at < now())
    order by created_at
    limit p_batch_limit
    for update skip locked
  )
  returning *;
$$ language sql;

-- New primary write entry point — wraps existing upsert + queues embedding
create or replace function fn_recipe_instruction_upsert(
  p_recipe_id    uuid,
  p_title        text,
  p_author_id    text,
  p_cuisine      text    default null,
  p_meal_type    text    default null,
  p_protein      text    default null,
  p_difficulty   text    default null,
  p_servings     int     default null,
  p_prep_time    int     default null,
  p_cook_time    int     default null,
  p_tags         text[]  default '{}',
  p_nutrition    jsonb   default '{}',
  p_description  text    default null,
  p_image_url    text    default null,
  p_instructions text[]  default '{}',
  p_ingredients  jsonb   default '[]'
) returns jsonb as $$
declare
  v_result    jsonb;
  v_recipe_id uuid;
begin
  -- 1. Existing upsert (handles recipe row + ingredient linking + queue)
  select fn_upsert_recipe_with_ingredients(
    p_recipe_id, p_title, p_author_id, p_cuisine, p_meal_type, p_protein,
    p_difficulty, p_servings, p_prep_time, p_cook_time, p_tags, p_nutrition,
    p_description, p_image_url, p_instructions, p_ingredients
  ) into v_result;

  v_recipe_id := (v_result->>'id')::uuid;
  if v_recipe_id is null then return v_result; end if;

  -- 2. Upsert instruction step rows (null embedding = needs embedding)
  insert into recipe_instruction_embeddings (recipe_id, step_index, instruction_text)
  select v_recipe_id, (ord - 1)::int, step
  from unnest(p_instructions) with ordinality as t(step, ord)
  where step is not null and trim(step) <> ''
  on conflict (recipe_id, step_index) do update
    set instruction_text = excluded.instruction_text,
        embedding        = null,
        embedded_at      = null;

  -- 3. Queue recipe for embedding
  insert into recipe_embedding_queue (recipe_id)
  values (v_recipe_id)
  on conflict (recipe_id) do update
    set status                      = 'pending',
        processing_started_at       = null,
        processing_lease_expires_at = null,
        processed_at                = null;

  return v_result;
end;
$$ language plpgsql security definer;
```

---

## New TypeScript Files

### `lib/openai-embeddings.ts`

Thin wrapper around OpenAI embeddings API (same `OPENAI_API_KEY` env var):

```typescript
const MODEL = "text-embedding-3-small"  // 1536 dims

export async function embedText(text: string): Promise<number[]>

// Batches in groups of 100 (OpenAI limit per request)
export async function embedBatch(texts: string[], batchSize = 100): Promise<number[][]>
```

### `lib/database/recipe-embedding-queue-db.ts`

Mirrors `ingredient-match-queue-db.ts` structure:

```typescript
claimPending(batchLimit, leaseSeconds)  → fn_claim_recipe_embedding_work RPC
markDone(id)                            → status = 'done', processed_at = now()
markFailed(id, error)                   → status = 'failed', last_error = error
requeueExpired()                        → reset expired 'processing' rows to 'pending'
```

### `lib/database/recipe-instruction-embeddings-db.ts`

```typescript
getPendingByRecipe(recipeId)                         → steps where embedding is null
upsertEmbedding(recipeId, stepIndex, embedding[])    → save embedding + embedded_at
getAllByRecipe(recipeId)                              → all steps with embeddings
```

### `queue/worker/embedding-processor.ts`

```typescript
export async function processEmbeddingBatch(config): Promise<EmbeddingBatchStats>
```

Per-recipe processing:
1. `recipeEmbeddingQueueDB.claimPending(batchLimit)` — claim with lease
2. **Attempt count cap**: if `queueRow.attempt_count >= 3` → `markFailed` and skip
3. Fetch pending instruction steps (null embedding) per recipe
4. `embedBatch(step texts)` → OpenAI call
5. Save embeddings to `recipe_instruction_embeddings`
6. Embed any `standardized_ingredients` where `name_embedding is null` (auto-backfill; dirty canonicals excluded — see Safeguards)
7. Cosine similarity per step (in TypeScript, no SQL call needed):
   - Load all clean `standardized_ingredients` with embeddings into memory (≈ 3 MB)
   - For each step embedding, compute dot products, collect top 5 candidates with similarity ≥ 0.70
8. Run **safeguard gauntlet** on each candidate list (see Safeguards section below)
9. Deduplicate passing auto-links by `canonical_id` across all steps
10. If any auto-links found and not dry-run: call `recipeDB.upsertRecipeWithIngredients({ recipeId, ingredients })`
11. `markDone(queueRow.id)`

Returns: `{ processed, stepsEmbedded, ingredientsAutoLinked, failed }`

---

## Updated Files

### `queue/worker/runner.ts`

Add `processEmbeddingBatch` call to the worker loop alongside the existing ingredient processor.

### `queue/index.ts`

Export `runEmbeddingQueueResolverFromEnv` (or extend existing export to include both).

### `lib/database/recipe-db.ts`

Add new method:
```typescript
async upsertRecipeWithEmbeddingQueue(payload: UpsertRecipePayload): Promise<Recipe | null>
  // Same signature as upsertRecipeWithIngredients
  // Calls fn_recipe_instruction_upsert instead of fn_upsert_recipe_with_ingredients
```

### `app/upload-recipe/page.tsx` + `app/edit-recipe/[id]/page.tsx`

Change `recipeDB.upsertRecipeWithIngredients(...)` → `recipeDB.upsertRecipeWithEmbeddingQueue(...)`

---

## New Script

### `scripts/backfill-ingredient-embeddings.ts`

One-time script to embed the 135 existing `standardized_ingredients` rows:

```bash
npx tsx scripts/backfill-ingredient-embeddings.ts
```

Fetches rows where `name_embedding is null`, calls `embedBatch`, writes embeddings back in batches. Safe to re-run (idempotent via `where name_embedding is null`).

---

## Confidence Thresholds

| Cosine similarity | Action |
|---|---|
| ≥ 0.85 | Enter safeguard gauntlet — auto-link only if all checks pass |
| 0.70 – 0.84 | Skip — SQL `fn_match_ingredient` handles this tier via trigram |
| < 0.70 | Ignore |

---

## Safeguards for Embedding-Based Ingredient Linking

These mirror the existing safeguards in `queue/worker/processor.ts`, `queue/worker/canonical-double-check.ts`, and `queue/worker/canonical-risk.ts`, adapted for cosine-similarity linking (no new canonical creation — only linking to existing `standardized_ingredients`).

### 1. Invalid Canonical Blocklist

Port of `INVALID_CANONICAL_NAMES` from `canonical-risk.ts`:

```typescript
const INVALID_CANONICAL_NAMES = new Set([
  "other", "unknown", "none", "null", "n/a", "na", "misc", "miscellaneous"
])
```

Any candidate whose `canonical_name` is in this set is skipped immediately, regardless of similarity.

### 2. Dirty Canonical Filter

Adapted from `assessNewCanonicalRisk` in `canonical-risk.ts`. Applied before embedding and before matching — excludes noisy/degenerate rows from the candidate pool:

- Skip if token count > 4 (retail product title, not a clean canonical name)
- Skip if noise density > 0.4 (ratio of numeric/special-char tokens to total tokens)

These rows remain in `standardized_ingredients` but are never embedded or auto-linked via this pipeline.

### 3. Form Token Protection

Port of `PROTECTED_FORM_TOKENS` + `maybeRetainFormSpecificCanonical` from `processor.ts`:

```typescript
const PROTECTED_FORM_TOKENS = new Set([
  "paste", "powder", "sauce", "broth", "stock", "puree",
  "extract", "juice", "syrup", "flakes", "seasoning", "mix"
])
```

**Rule**: If the instruction step text contains a protected form token but the matched canonical does **not** contain it → reject the match, try next candidate.

Example: step "add 2 tbsp tomato paste" must not auto-link to canonical `tomato`.

### 4. Direction-Aware Similarity Thresholds

Port of `resolveRemapDirection` + `meetsAsymmetricRemapPolicy` from `canonical-double-check.ts`:

**Direction** is determined by comparing the token count of the ingredient phrase extracted from the step vs the canonical name:

| Direction | When | Min similarity |
|---|---|---|
| `lateral` | Same token count | 0.85 |
| `generic_to_specific` | Canonical has more tokens (more specific) | 0.92 |
| `specific_to_generic` | Canonical has fewer tokens (more generic) | 0.95 |

Prevents "olive oil" in a step from matching canonical `oil` (specific→generic at 0.95 is hard to pass), and prevents "milk" from matching canonical `whole milk, vitamin D added` without very high confidence.

### 5. Cross-Category Penalty

Port of `CROSS_CATEGORY_SCORE_PENALTY` pattern from `canonical-double-check.ts`:

If the matched canonical belongs to a different food category than the step's implied category (derived from `standardized_ingredients.category`), apply a **−0.15 penalty** to the raw similarity score. The penalized score must still be ≥ 0.85 to auto-link.

### 6. Blocked Match Fallback

Port of `resolveBlockedNewCanonicalFallback` from `canonical-risk.ts`:

The candidate query returns top 5 per step. If candidate #1 fails any check above, try #2–#5 in order. First passing candidate is used. If all 5 fail → step produces no auto-link (logged as `"blocked"`). SQL trigram match handles this step at its own confidence level.

### 7. Per-Recipe Deduplication

Before calling `upsertRecipeWithIngredients`, deduplicate auto-links by `canonical_id`. Same ingredient appearing semantically in multiple steps → linked once.

### 8. Attempt Count Cap

`fn_claim_recipe_embedding_work` increments `attempt_count` on each claim. At processing start:

```typescript
if (queueRow.attempt_count >= 3) {
  await recipeEmbeddingQueueDB.markFailed(queueRow.id, "max attempts exceeded")
  continue
}
```

Prevents infinite requeue loops for systematically failing recipes.

### 9. Dry-Run Mode

`EMBEDDING_DRY_RUN=true` env var: compute embeddings and run the full safeguard gauntlet, log all decisions — but skip the `upsertRecipeWithIngredients` write. Queue entry still marked `done`. Safe for staging.

### 10. Decision Logging

Every auto-link candidate decision is logged as structured JSON to stdout:

```typescript
{
  recipe_id: string,
  step_index: number,
  step_preview: string,           // first 80 chars of instruction_text
  candidate_canonical: string,
  similarity: number,
  direction: "lateral" | "generic_to_specific" | "specific_to_generic",
  form_check_passed: boolean,
  cross_category_penalty: number,
  action: "auto-link" | "blocked-form" | "blocked-direction"
        | "blocked-invalid" | "blocked-cross-category" | "below-threshold"
}
```

Complete audit trail of what was and wasn't linked, and why.

---

## Rollout Checklist

- [ ] Migration 1: Enable pgvector extension
- [ ] Migration 2: Schema additions (tables + indexes + column)
- [ ] Migration 3: SQL functions (`fn_claim_recipe_embedding_work`, `fn_recipe_instruction_upsert`)
- [ ] Create `lib/openai-embeddings.ts`
- [ ] Create `lib/database/recipe-embedding-queue-db.ts`
- [ ] Create `lib/database/recipe-instruction-embeddings-db.ts`
- [ ] Create `queue/worker/embedding-processor.ts`
- [ ] Update `queue/worker/runner.ts`
- [ ] Update `queue/index.ts`
- [ ] Add `upsertRecipeWithEmbeddingQueue` to `lib/database/recipe-db.ts`
- [ ] Update `app/upload-recipe/page.tsx`
- [ ] Update `app/edit-recipe/[id]/page.tsx`
- [ ] Create and run `scripts/backfill-ingredient-embeddings.ts`
- [ ] Verify: save recipe → `recipe_embedding_queue` row appears
- [ ] Verify: run worker → embeddings stored, ingredients auto-linked

---

## Not In Scope

- Changing `fn_upsert_recipe_with_ingredients` SQL — it's called internally and unchanged
- Storing embeddings for recipe titles/descriptions (possible future use)
- Real-time embedding at request time — always async via queue
- User-facing UI showing which instructions contain which ingredients (future)
