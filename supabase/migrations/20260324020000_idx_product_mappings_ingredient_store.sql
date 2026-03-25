-- Add composite index on product_mappings(standardized_ingredient_id, store_brand).
--
-- Every app-facing pricing function (get_pricing, calculate_recipe_cost,
-- get_best_store_for_plan, get_ingredient_price_details) joins product_mappings
-- on standardized_ingredient_id, often also filtered/grouped by store_brand.
-- Without this index each query performs a full sequential scan of ~12k rows
-- per ingredient — one scan per ingredient in the shopping list or recipe.
--
-- fn_consolidate_canonical also benefits: the UPDATE that reassigns
-- standardized_ingredient_id from loser → survivor previously required a full
-- scan of product_mappings.

CREATE INDEX IF NOT EXISTS idx_product_mappings_ingredient_store
    ON public.product_mappings (standardized_ingredient_id, store_brand)
    WHERE standardized_ingredient_id IS NOT NULL;
