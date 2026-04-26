## Phase 4A â€” Recipe Upload Human Labels
**Risk: Low to medium. Additive label stream; must preserve provenance.**

### Goal
Use recipe upload and edit flows as a human-generated standards/resolution source. Imported recipes already flow into the manual form before save (`app/upload-recipe/page.tsx`), and saved recipe ingredients can carry `standardizedIngredientId` through `recipeDB.upsertRecipeWithIngredients()`. That makes recipe upload a natural labeling stream for:

- alias graph edges (`display_name` -> confirmed canonical)
- token links and synonym discovery
- deterministic builder examples
- reranker calibration labels
- canonical creation review and merge suggestions

This is not a hot-path auto-training shortcut. Human labels are recorded with provenance and trust level, then promoted into deterministic behavior only after quality gates.

### Current Architecture Hook

Recipe upload currently:

1. imports URL/image/paragraph data into `ImportedRecipe`
2. moves imported data into `RecipeManualEntryForm`
3. submits `RecipeSubmissionData`
4. calls `recipeDB.upsertRecipeWithIngredients()`
5. maps each ingredient into the RPC payload as:

```ts
{
  display_name: ingredient.name.trim(),
  standardized_ingredient_id: ingredient.standardizedIngredientId ?? null,
  quantity: ingredient.quantity ?? null,
  units: ingredient.unit ?? null,
}
```

Only rows with a non-null `standardized_ingredient_id` are confirmed resolution labels. Rows without a standardized ID can still be useful as raw aliases, but they must not be treated as accepted mappings.

### Label Table

```sql
-- supabase/migrations/0020_recipe_human_resolution_labels.sql

create table recipe_human_resolution_labels (
  id uuid primary key default gen_random_uuid(),

  recipe_id uuid references recipes(id) on delete cascade,
  recipe_ingredient_id uuid references recipe_ingredients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  raw_display_name text not null,
  normalized_alias text not null,
  canonical_id uuid references standardized_ingredients(id) on delete set null,
  canonical_name text,

  source text not null check (source in (
    'manual_recipe_entry',
    'import_review_save',
    'recipe_edit'
  )),

  -- explicit_select = user chose/changed a standard in UI
  -- reviewed_save = imported/manual value was saved with an existing standard
  -- raw_only = no standard selected; useful only as an unresolved alias
  label_strength text not null check (label_strength in (
    'explicit_select',
    'reviewed_save',
    'raw_only'
  )),

  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

create index idx_rhrl_canonical on recipe_human_resolution_labels (canonical_id)
  where canonical_id is not null;
create index idx_rhrl_alias on recipe_human_resolution_labels (normalized_alias);
create index idx_rhrl_created_at on recipe_human_resolution_labels (created_at desc);
```

### Write Path

After `fn_upsert_recipe_with_ingredients` returns, write one label per submitted ingredient:

- `explicit_select` when the UI can prove the user selected or changed the standardized ingredient
- `reviewed_save` when a submitted ingredient has `standardizedIngredientId` but no explicit selection event
- `raw_only` when no standardized ID exists

For the first implementation, `reviewed_save` is enough. Later UI work can add explicit selection tracking in `RecipeManualEntryForm`.

### Feeding The Standardizer

Human labels feed Phase 4 and Phase 5 in controlled ways:

```ts
// On reviewed_save or explicit_select with canonical_id:
await writeAliasEdge({
  normalizedAlias,
  canonicalId,
  canonicalName,
  context: 'recipe',
  source: labelStrength === 'explicit_select'
    ? 'recipe_edit_human_label'
    : 'recipe_upload_human_label',
  accepted: true,
})

// On explicit_select only, or reviewed_save after repeated agreement:
await writeLearnedTokenLinks({
  alias: normalizedAlias,
  canonicalName,
  source: 'recipe_upload_human_label',
})
```

Promotion rules:

- `explicit_select` can count as 2 accepts in the alias graph.
- `reviewed_save` counts as 1 accept, but cannot create a trusted auto-resolve edge by itself until it has at least 3 distinct recipes or users.
- `raw_only` never creates accepted edges; it is used for recall analysis and unresolved-alias queues.
- Recipe labels are context-scoped to `recipe` by default. They can become context-agnostic only after scraper/pantry evidence agrees.

### Deterministic ML / Reranker Use

The deterministic builder and reranker should use this table as labeled data:

- positive examples: `normalized_alias -> canonical_id`
- hard negatives: same alias with rejected/changed canonical from future explicit edits
- synonym candidates: alias tokens missing from canonical and canonical tokens missing from alias
- form/variety examples: cases where the human preserves form tokens the LLM might collapse

This gives the deterministic machine-learning layer human-generated standards without making the live resolver depend on unreviewed imports.

### Files Changed
- New: `supabase/migrations/0020_recipe_human_resolution_labels.sql` (or next available migration number)
- New: `lib/standardizer/human-labels/recipe-label-writer.ts`
- Modified: `lib/database/recipe-db.ts` â€” write labels after `upsertRecipeWithIngredients()`
- Optional: `components/recipe/forms/recipe-manual-entry-form/*` â€” track explicit standardized-ingredient selection events

### Phase 4A Exit Criteria
- At least 200 recipe labels collected
- At least 50 labels with non-null `canonical_id`
- No auto-resolve behavior changes until alias graph promotion thresholds are met
- Baseline report includes recipe human-label agreement rate and top unresolved raw aliases

---

