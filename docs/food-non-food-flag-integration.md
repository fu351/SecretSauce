# Food vs Non-Food Flag Integration

## Agent Metadata

- `Doc Kind`: `operations-guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-23`
- `Primary Surfaces`: `supabase/migrations/ingredient_match_queue.sql`, `supabase/migrations/standardized_ingredients.sql`, `lib/prompts/ingredient-standardizer/build-prompt.ts`, `queue/worker/processor.ts`, `lib/ingredient-standardizer.ts`
- `Update Trigger`: Queue classification contract, schema columns, or resolver behavior for non-food handling changes.

## Agent Use

- `Read this when`: adding or debugging food/non-food classification in the ingredient queue pipeline.
- `Stop reading when`: schema and worker changes are fully applied and validation checks pass.
- `Escalate to`: `docs/ingredient-queue-realtime-plan.md`, `docs/prompt-maintenance-guide.md`, `docs/database-guide.md`.

## Purpose

Add an explicit flag to distinguish food vs non-food items, prevent non-food products (for example, paper towels) from entering canonical ingredient records, and keep queue + prompt behavior consistent.

## Integration Steps

1. Add DB columns and trigger behavior.
- Add `is_food_item` to `public.ingredient_match_queue` (nullable; unknown until classified).
- Add `is_food_item` to `public.standardized_ingredients` (`NOT NULL DEFAULT true`).
- Update `public.fn_sync_product_mapping_is_ingredient_from_queue()` so resolved rows with `is_food_item = false` keep `product_mappings.is_ingredient = false`.
- Recreate `trg_queue_sync_product_mapping_is_ingredient` if needed to include `is_food_item` in `UPDATE OF ...`.
- Put these in a new forward migration file under `supabase/migrations/`.

2. Keep table snapshot SQL files aligned.
- Update `supabase/migrations/ingredient_match_queue.sql` create-table definition to include `is_food_item`.
- Update `supabase/migrations/standardized_ingredients.sql` create-table definition to include `is_food_item`.
- Ensure trigger declarations in snapshot SQL still match the latest runtime function signatures.

3. Update prompt contract to output food classification.
- In `lib/prompts/ingredient-standardizer/build-prompt.ts`, require a boolean output field `isFoodItem` for each row.
- In `lib/prompts/ingredient-standardizer/sections.ts`:
- Add explicit rule text: non-food items must return `isFoodItem: false`, `category: null`, and very low confidence.
- Update output JSON schema examples to include `isFoodItem`.
- Keep food examples returning `isFoodItem: true`.

4. Parse and carry the new field from model output.
- In `lib/ingredient-standardizer.ts`:
- Extend `IngredientStandardizationResult` with `isFoodItem: boolean`.
- Parse `isFoodItem` from model JSON; use safe fallback behavior for old cached outputs.
- Ensure fallback/no-model results default to `isFoodItem: true` (avoid mass false negatives during outages).

5. Enforce non-food behavior in queue resolution.
- In `queue/worker/processor.ts`, after ingredient AI result:
- If `isFoodItem === false`, do not call `standardizedIngredientsDB.getOrCreate(...)`.
- Resolve queue row with `resolved_ingredient_id = null`, `is_food_item = false`, and clear review flags.
- Skip unit-resolution writes for these non-food rows.
- If `isFoodItem === true`, proceed with normal canonical lookup/create path and write `is_food_item = true`.

6. Update DB access methods and generated types.
- In `lib/database/ingredient-match-queue-db.ts`, add optional `isFoodItem` params to `markResolved`/other relevant methods and map to `is_food_item`.
- In `lib/database/supabase.ts`, add `is_food_item` to:
- `Tables.standardized_ingredients.Row/Insert/Update`
- `Tables.ingredient_match_queue.Row/Insert/Update`
- Update any cache payload types in `queue/worker/ingredient-cache-utils.ts` if you persist ingredient model outputs.

7. Backfill existing data (recommended).
- Set known food rows:
- `ingredient_match_queue.is_food_item = true` where `resolved_ingredient_id IS NOT NULL`.
- Set known non-food rows from scraper mapping state:
- `ingredient_match_queue.is_food_item = false` for scraper rows tied to `product_mappings.is_ingredient = false` where still null.
- Leave uncertain historical rows as `NULL` if no trustworthy signal exists.

8. Validate with targeted checks.
- Run queue worker in dry run first (`scripts/resolve-ingredient-match-queue.ts`) using a test batch that includes food + non-food names.
- Confirm expected DB outcomes:
- Non-food row resolves with `is_food_item = false`.
- Non-food row has `resolved_ingredient_id IS NULL`.
- No new non-food canonical row is inserted into `standardized_ingredients`.
- Scraper mapping remains `is_ingredient = false`.

9. Rollout order.
- Deploy DB migration first.
- Deploy app/worker code second.
- Run one dry-run queue pass.
- Run one small real queue batch.
- Monitor failures and false positives, then resume normal schedules.

10. Rollback plan.
- If model outputs become unstable, temporarily force ingredient rows to default `isFoodItem = true` in parser fallback while keeping prompt contract in place.
- If queue resolution regresses, disable non-food branch logic in worker and continue manual review mode until prompt/parser is fixed.

## Quick SQL Validation Snippets

```sql
-- Recent classified non-food queue rows
select id, raw_product_name, cleaned_name, status, is_food_item, resolved_ingredient_id, resolved_at
from public.ingredient_match_queue
where is_food_item = false
order by resolved_at desc nulls last
limit 50;

-- Any non-food canonical rows (should be empty unless intentionally retained)
select id, canonical_name, category, is_food_item, created_at
from public.standardized_ingredients
where is_food_item = false
order by created_at desc
limit 50;

-- Product mappings currently flagged non-ingredient
select id, raw_product_name, is_ingredient, standardized_ingredient_id
from public.product_mappings
where is_ingredient = false
order by last_seen_at desc nulls last
limit 50;
```

## Exit Criteria

- Non-food queue items are explicitly marked with `is_food_item = false`.
- Non-food queue items do not create rows in `standardized_ingredients`.
- Food items continue to resolve and map normally.
- Prompt outputs include `isFoodItem` consistently.
- Scraper product mappings stay aligned with queue classification.
