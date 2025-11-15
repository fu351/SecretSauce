# Ingredient Data Setup Guide

This guide walks you through populating the standardized ingredients and ingredient mappings in your database.

## Overview

You have three ways to set up the ingredient data:

1. **SQL Script (Recommended for standardized ingredients)**
2. **SQL Script with Query Helpers (For creating mappings)**
3. **TypeScript Utility (For full automation)**

---

## Method 1: SQL Scripts (Fastest)

### Step 1: Insert Standardized Ingredients

Run the SQL script in Supabase:

```sql
-- File: scripts/INSERT_STANDARDIZED_INGREDIENTS.sql
-- This creates 43 standardized ingredients with automatic categorization
```

**How to execute:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `scripts/INSERT_STANDARDIZED_INGREDIENTS.sql`
3. Paste into SQL editor and run
4. You should see "43 rows" inserted

**What it does:**
- Inserts 43 standardized ingredient names
- Automatically assigns categories (Meat, Dairy, Produce, Spices, Pantry)
- Uses `ON CONFLICT` to avoid duplicate errors if re-run

**Verification:**
```sql
SELECT COUNT(*) FROM public.standardized_ingredients;
-- Should return: 43
```

### Step 2: Create Ingredient Mappings

Run the mapping script in Supabase:

```sql
-- File: scripts/CREATE_INGREDIENT_MAPPINGS.sql
```

**How to execute:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `scripts/CREATE_INGREDIENT_MAPPINGS.sql`
3. Paste into SQL editor and run (as one complete script)

**What it does:**
- Creates a temporary table of all recipe ingredients
- Shows unmapped ingredients (ingredients in recipes that don't match standardized names)
- Automatically maps recipes where ingredient names exactly match
- Shows results summary

**Expected Output:**

After running, you'll see queries that show:

1. **Unmapped Ingredients** - Recipe ingredients that couldn't be automatically matched
   - You may need to manually map these
   - Most likely to succeed with exact matches

2. **Mapping Results** - How many recipes use each standardized ingredient

3. **Recipe Completion Status** - Shows % of ingredients mapped per recipe

**Important:** Review the unmapped ingredients. Common reasons:
- Typo in recipe ingredient name
- Different wording (e.g., "sliced chicken" vs "chicken breast")
- Ingredient not in standardized list yet

---

## Method 2: TypeScript Utility (Most Flexible)

If you need more control or want to handle unmapped ingredients differently:

```bash
# Install dependencies if needed
npm install

# Run the setup script
npx ts-node lib/setup-ingredient-data.ts
```

**What it does:**
1. Inserts all standardized ingredients with intelligent categorization
2. Fetches all recipes and their ingredients
3. Matches original names to standardized names using the mapping data
4. Batch inserts all ingredient_mappings
5. Reports success/unmapped counts

**Output Example:**
```
==================================================
Setting up ingredient data...
==================================================
Inserting 43 standardized ingredients...
Successfully inserted standardized ingredients

Inserting 125 ingredient mappings...
Successfully created ingredient mappings
  Mapped: 125
  Unmapped: 3

Final Result: {
  success: true,
  standardizedInserted: 43,
  mappingsCreated: 125,
  mappingsUnmapped: 3
}
```

---

## Method 3: Manual SQL (For specific control)

### Insert a single standardized ingredient:

```sql
INSERT INTO public.standardized_ingredients (canonical_name, category)
VALUES ('milk', 'Dairy')
ON CONFLICT (canonical_name) DO NOTHING;
```

### Manually map a recipe ingredient:

```sql
-- First, find the standardized ingredient ID
SELECT id FROM public.standardized_ingredients
WHERE canonical_name = 'chicken breast';

-- Then create the mapping (replace recipe_id and standardized_ingredient_id)
INSERT INTO public.ingredient_mappings (recipe_id, original_name, standardized_ingredient_id)
VALUES ('recipe-uuid-here', 'chicken breast, sliced', 'ingredient-uuid-here')
ON CONFLICT (recipe_id, original_name) DO NOTHING;
```

---

## Handling Unmapped Ingredients

If after running the scripts you find unmapped ingredients, you have options:

### Option 1: Add to Standardized Ingredients

If an ingredient should exist but doesn't:

```sql
INSERT INTO public.standardized_ingredients (canonical_name, category)
VALUES ('milk', 'Dairy')
ON CONFLICT (canonical_name) DO NOTHING;
```

### Option 2: Update Recipe Ingredient Names

If a recipe has a typo or non-standard name, update the recipe:

```sql
UPDATE public.recipes
SET ingredients = jsonb_set(
  ingredients,
  '{0, name}',
  '"chicken breast"'
)
WHERE id = 'recipe-id-here';
```

### Option 3: Create New Mapping

Manually create a mapping for a variant name:

```sql
-- Map "boneless chicken breast" to the "chicken breast" standardized ingredient
INSERT INTO public.ingredient_mappings (recipe_id, original_name, standardized_ingredient_id)
SELECT
  r.id,
  'boneless chicken breast',
  si.id
FROM public.recipes r, public.standardized_ingredients si
WHERE r.title = 'Your Recipe Name'
  AND si.canonical_name = 'chicken breast'
ON CONFLICT (recipe_id, original_name) DO NOTHING;
```

---

## Verify Your Setup

After running the setup scripts, verify with these queries:

### 1. Check standardized ingredients count

```sql
SELECT COUNT(*) FROM public.standardized_ingredients;
-- Should be: 43
```

### 2. Check ingredient mappings count

```sql
SELECT COUNT(*) FROM public.ingredient_mappings;
-- Should be approximately equal to total ingredients across all recipes
```

### 3. See ingredients by category

```sql
SELECT category, COUNT(*) as count
FROM public.standardized_ingredients
GROUP BY category
ORDER BY count DESC;
```

### 4. Find unmapped recipe ingredients

```sql
SELECT DISTINCT
  jsonb_array_elements(r.ingredients)->>'name' as ingredient_name,
  COUNT(*) as recipe_count
FROM public.recipes r
WHERE NOT EXISTS (
  SELECT 1 FROM public.ingredient_mappings im
  WHERE im.recipe_id = r.id
    AND im.original_name = jsonb_array_elements(r.ingredients)->>'name'
)
AND r.ingredients IS NOT NULL
GROUP BY ingredient_name
ORDER BY recipe_count DESC;
```

### 5. Check recipes with complete ingredient mappings

```sql
SELECT
  r.id,
  r.title,
  COUNT(DISTINCT jsonb_array_elements(r.ingredients)->>'name') as total_ingredients,
  COUNT(DISTINCT im.standardized_ingredient_id) as mapped_ingredients,
  ROUND(100.0 * COUNT(DISTINCT im.standardized_ingredient_id) /
        COUNT(DISTINCT jsonb_array_elements(r.ingredients)->>'name'), 1) as coverage_percent
FROM public.recipes r
LEFT JOIN public.ingredient_mappings im ON r.id = im.recipe_id
WHERE r.ingredients IS NOT NULL
GROUP BY r.id, r.title
ORDER BY coverage_percent DESC, r.title;
```

---

## Current Ingredient List

The setup includes 43 ingredients organized by category:

### Meat (4)
- beef sirloin
- chicken breast
- pancetta

### Dairy (4)
- butter
- eggs
- pecorino romano cheese

### Produce (12)
- avocado
- baby spinach
- bell pepper
- broccoli
- eggplant
- garlic
- green beans
- lemon juice
- onion
- sweet potato
- thai basil
- whole grain bread

### Spices (4)
- black pepper
- red pepper flakes
- salt
- salt and pepper

### Pantry (19)
- all-purpose flour
- baking soda
- brown sugar
- chickpeas
- chocolate chips
- coconut milk
- cornstarch
- fish sauce
- granulated sugar
- green curry paste
- maple syrup
- olive oil
- oyster sauce
- quinoa
- rice
- soy sauce
- spaghetti pasta
- tahini
- vanilla extract
- vegetable oil
- white vinegar

---

## Next Steps After Setup

1. **Run the daily scraper** to populate ingredient_cache with prices
   ```bash
   curl http://localhost:3000/api/daily-scraper \
     -H "Authorization: Bearer your_secret_key"
   ```

2. **Test recipe pricing** by viewing a recipe detail page
   - Recipe pricing card should appear and show available prices

3. **Check shopping list** functionality
   - Shopping list search should now use cache first

4. **Monitor cache** with these queries:
   ```sql
   -- See cached prices
   SELECT store, COUNT(*) as cached_items
   FROM ingredient_cache
   WHERE expires_at > NOW()
   GROUP BY store;

   -- See prices for a specific ingredient
   SELECT si.canonical_name, ic.store, ic.price, ic.unit_price, ic.expires_at
   FROM ingredient_cache ic
   JOIN standardized_ingredients si ON ic.standardized_ingredient_id = si.id
   WHERE si.canonical_name = 'chicken breast'
   ORDER BY ic.store;
   ```

---

## Troubleshooting

### Issue: "Duplicate key value violates unique constraint"

**Cause:** Trying to insert a standardized ingredient that already exists

**Solution:** Use `ON CONFLICT ... DO NOTHING` in INSERT statements (already included in our scripts)

### Issue: No ingredients appearing in recipe pricing

**Cause:** Ingredients haven't been mapped for that recipe

**Solution:** Run the CREATE_INGREDIENT_MAPPINGS script or manually create mappings

### Issue: Recipe shows "pricing not available"

**Cause:** Ingredients are mapped but no prices in cache

**Solution:** Run the daily scraper to populate the cache

### Issue: Some ingredients won't map

**Cause:** Recipe ingredient names don't match standardized names exactly

**Solution:**
1. Check if ingredient needs to be added to standardized list
2. Or manually create specific mapping
3. Or update recipe ingredient name to match standardized format

---

## Adding New Ingredients Later

When you add new recipes or need new ingredients:

```sql
-- 1. Add to standardized ingredients
INSERT INTO public.standardized_ingredients (canonical_name, category)
VALUES ('new ingredient', 'Pantry')
ON CONFLICT (canonical_name) DO NOTHING;

-- 2. Create mappings (automatic if names match, or manual)
INSERT INTO public.ingredient_mappings (recipe_id, original_name, standardized_ingredient_id)
SELECT 'recipe-id', 'new ingredient', id
FROM public.standardized_ingredients
WHERE canonical_name = 'new ingredient';
```

---

**Last Updated:** 2025-11-15
**Created By:** Claude Code
