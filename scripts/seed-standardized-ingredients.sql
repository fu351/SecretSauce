-- Seed standardized ingredients
INSERT INTO public.standardized_ingredients (canonical_name)
VALUES
  ('all-purpose flour'),
  ('avocado'),
  ('baby spinach'),
  ('baking soda'),
  ('beef sirloin'),
  ('bell pepper'),
  ('black pepper'),
  ('broccoli'),
  ('brown sugar'),
  ('butter'),
  ('chicken breast'),
  ('chickpeas'),
  ('chocolate chips'),
  ('coconut milk'),
  ('cornstarch'),
  ('eggplant'),
  ('eggs'),
  ('fish sauce'),
  ('garlic'),
  ('granulated sugar'),
  ('green beans'),
  ('green curry paste'),
  ('lemon juice'),
  ('maple syrup'),
  ('olive oil'),
  ('onion'),
  ('oyster sauce'),
  ('pancetta'),
  ('pecorino romano cheese'),
  ('quinoa'),
  ('red pepper flakes'),
  ('rice'),
  ('salt'),
  ('salt and pepper'),
  ('soy sauce'),
  ('spaghetti pasta'),
  ('sweet potato'),
  ('tahini'),
  ('thai basil'),
  ('vanilla extract'),
  ('vegetable oil'),
  ('white vinegar'),
  ('whole grain bread')
ON CONFLICT (canonical_name) DO NOTHING;


-- Populate ingredient_mappings using canonical aliases
WITH mapping_data (original_name, canonical_name) AS (
    VALUES
      ('all-purpose flour', 'all-purpose flour'),
      ('avocado, sliced', 'avocado'),
      ('baby spinach', 'baby spinach'),
      ('baking soda', 'baking soda'),
      ('beef sirloin, sliced thin', 'beef sirloin'),
      ('bell pepper, sliced', 'bell pepper'),
      ('black pepper, freshly ground', 'black pepper'),
      ('broccoli florets', 'broccoli'),
      ('brown sugar', 'brown sugar'),
      ('brown sugar, packed', 'brown sugar'),
      ('butter, softened', 'butter'),
      ('chicken breast, sliced', 'chicken breast'),
      ('chickpeas, cooked', 'chickpeas'),
      ('chocolate chips', 'chocolate chips'),
      ('coconut milk (14oz)', 'coconut milk'),
      ('cornstarch', 'cornstarch'),
      ('eggplant, cubed', 'eggplant'),
      ('eggs', 'eggs'),
      ('fish sauce', 'fish sauce'),
      ('garlic, minced', 'garlic'),
      ('granulated sugar', 'granulated sugar'),
      ('green beans, trimmed', 'green beans'),
      ('green curry paste', 'green curry paste'),
      ('jasmine rice, cooked', 'rice'),
      ('cooked rice', 'rice'),
      ('lemon juice', 'lemon juice'),
      ('maple syrup', 'maple syrup'),
      ('olive oil', 'olive oil'),
      ('onion, sliced', 'onion'),
      ('oyster sauce', 'oyster sauce'),
      ('pancetta, diced', 'pancetta'),
      ('Pecorino Romano cheese, grated', 'pecorino romano cheese'),
      ('quinoa, uncooked', 'quinoa'),
      ('red pepper flakes', 'red pepper flakes'),
      ('ripe avocado', 'avocado'),
      ('salt', 'salt'),
      ('salt and pepper', 'salt and pepper'),
      ('soy sauce', 'soy sauce'),
      ('spaghetti pasta', 'spaghetti pasta'),
      ('sweet potato, cubed', 'sweet potato'),
      ('tahini', 'tahini'),
      ('Thai basil leaves', 'thai basil'),
      ('vanilla extract', 'vanilla extract'),
      ('vegetable oil', 'vegetable oil'),
      ('white vinegar', 'white vinegar'),
      ('whole grain bread', 'whole grain bread')
),
recipe_ingredients AS (
    SELECT
        r.id AS recipe_id,
        lower(trim(ingredient ->> 'name')) AS ingredient_name
    FROM public.recipes r
    CROSS JOIN LATERAL jsonb_array_elements(r.ingredients) AS ingredient
    WHERE r.ingredients IS NOT NULL
),
normalized_mapping AS (
    SELECT
        md.original_name,
        md.canonical_name,
        si.id AS standardized_id
    FROM mapping_data md
    JOIN public.standardized_ingredients si
      ON lower(si.canonical_name) = lower(md.canonical_name)
),
matches AS (
    SELECT
        ri.recipe_id,
        md.original_name,
        nm.standardized_id
    FROM recipe_ingredients ri
    JOIN mapping_data md
      ON lower(ri.ingredient_name) = lower(md.original_name)
    JOIN normalized_mapping nm
      ON nm.canonical_name = md.canonical_name
)
INSERT INTO public.ingredient_mappings (recipe_id, original_name, standardized_ingredient_id)
SELECT DISTINCT
    m.recipe_id,
    m.original_name,
    m.standardized_id
FROM matches m
ON CONFLICT (recipe_id, original_name) DO NOTHING;

