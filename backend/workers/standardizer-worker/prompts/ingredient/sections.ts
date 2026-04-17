export const NORMALIZATION_RULES_SECTION = `
**3. NORMALIZATION RULES:**

   a) **Strip Preparation Methods:**
      - Remove: chopped, minced, diced, sliced, grated, shredded, crushed
      - Remove: cooked, raw, steamed, boiled, roasted, grilled, fried
      - Example: "chopped yellow onion" -> "onion"

   b) **Strip Non-Essential Qualifiers:**
      - Size: large, small, medium, jumbo
      - Quality: fresh, organic, premium, extra, fancy, free-range
      - Freshness: ripe, unripe, day-old
      - Optional: to taste, optional, divided, if needed, as needed
      - Marketing: deluxe, gourmet, artisan, homestyle, restaurant-style
      - Example: "large organic roma tomatoes" -> "tomato"

   c) **PRESERVE Important Varieties** (these matter for shopping):
      - Meat cuts: "chicken breast", "chicken thigh", "ground beef", "pork chop", "beef stew meat"
      - Cheese types: "cheddar cheese", "mozzarella cheese", "parmesan cheese", "cream cheese"
      - Wine/alcohol types: "white wine", "red wine", "beer", "dry vermouth"
      - Flour types: "all-purpose flour", "bread flour", "whole wheat flour", "cake flour"
      - Oil types: "olive oil", "vegetable oil", "canola oil", "coconut oil"
      - Produce varieties: "yellow onion", "red onion", "roma tomato", "cherry tomato"
      - Rice types: "white rice", "brown rice", "jasmine rice", "basmati rice"
      - Milk types: "whole milk", "2% milk", "almond milk", "oat milk"

   d) **Remove Brand Names:**
      - "Kraft cheddar cheese" -> "cheddar cheese"
      - "Heinz ketchup" -> "ketchup"
      - "Campbell's tomato soup" -> "tomato soup"
      - "Philadelphia cream cheese" -> "cream cheese"
      - Remove brand-like tokens and possessive brand markers (e.g. "kinder's", "mccormick", "charles shaw")

   e) **Singular Form:**
      - "tomatoes" -> "tomato"
      - "apples" -> "apple"
      - "eggs" -> "egg"
      - Exception: Items typically plural ("green beans", "black beans", "rice noodles")

   f) **Lowercase Everything:**
      - All canonical names must be lowercase

   g) **Normalize Accented Characters:**
      - Convert accented Latin letters to plain ASCII where applicable
      - "jalapeño" -> "jalapeno"
      - "piñon" -> "pinon"
      - "crème fraîche" -> "creme fraiche"

   h) **Strip Packaging / Retail Noise:**
      - Remove counts and packaging units: "12 slices", "6 ct", "24 pack", "750ml", "1 gal", "5.5oz"
      - Remove merchandising words: deli, family-size, value pack, party size, microwavable, ready-to-eat
      - Remove grade/marketing labels: grade aa, cage free, premium, classic, original, homestyle

   i) **No Product-Title Canonicals:**
      - canonicalName should be concise and ingredient-like, usually 1-4 words
      - Do NOT include vintage/year/model-like tokens ("2024", "vintage", "limited edition")
      - If the cleaned phrase is still a full product title, reduce to base ingredient/product archetype
      - Good: "swiss cheese", "red wine", "taco seasoning", "mayonnaise"
      - Bad: "sargento baby swiss sliced cheese 11 slices", "charles shaw nouveau red table wine 2024"
`

export const CATEGORY_ASSIGNMENT_SECTION = `
**5. CATEGORY ASSIGNMENT** (use EXACT enum values):
   - **produce**: fruits, vegetables, fresh herbs, fresh chili peppers (jalapeno, serrano, habanero)
   - **dairy**: milk, cheese, yogurt, butter, eggs, cream
   - **meat_seafood**: all meats, poultry, fish, seafood
   - **pantry_staples**: sugar, salt, oil, rice, pasta, beans, canned goods, grains
   - **beverages**: drinks, juice, soda, coffee, tea (NOT milk/cream - those are dairy)
   - **snacks**: chips, crackers, cookies, candy, nuts (unopened packaged snacks)
   - **condiments**: sauces, dressings, ketchup, mustard, mayo, vinegar, soy sauce
   - **baking**: flour (all types), baking powder, baking soda, vanilla extract, chocolate chips, yeast
   - **spices**: dried spices and seasoning blends (paprika, cumin, turmeric, curry powder, chili flakes)
   - **other**: items that don't fit above categories

   For NON-FOOD items: category = null
`

export const EXAMPLES_SECTION = `
===============================================================
EXAMPLES OF PROPER NORMALIZATION:
===============================================================

**Standard Ingredient Normalization:**

[OK] "2 large organic yellow onions, chopped"
  -> canonicalName: "onion"
  -> category: "produce"
  -> confidence: 0.92

[OK] "grated parmesan cheese, divided"
  -> canonicalName: "parmesan cheese"
  -> category: "dairy"
  -> confidence: 0.88

[OK] "boneless skinless chicken breast"
  -> canonicalName: "chicken breast"
  -> category: "meat_seafood"
  -> confidence: 0.90

[OK] "1 lb fresh basil leaves"
  -> canonicalName: "basil"
  -> category: "produce"
  -> confidence: 0.95

[OK] "jalapeño pepper"
  -> canonicalName: "jalapeno"
  -> category: "produce"
  -> confidence: 0.94

[OK] "Kraft extra sharp cheddar cheese"
  -> canonicalName: "cheddar cheese"
  -> category: "dairy"
  -> confidence: 0.85

[OK] "all-purpose flour"
  -> canonicalName: "all-purpose flour"
  -> category: "baking"
  -> confidence: 0.98

[OK] "extra virgin olive oil, divided"
  -> canonicalName: "olive oil"
  -> category: "pantry_staples"
  -> confidence: 0.92

[OK] "kosher salt to taste"
  -> canonicalName: "salt"
  -> category: "pantry_staples"
  -> confidence: 0.98

[OK] "Sargento baby swiss sliced cheese 11 slices"
  -> canonicalName: "swiss cheese"
  -> category: "dairy"
  -> confidence: 0.88

[OK] "Charles Shaw Nouveau Red Table Wine 2024"
  -> canonicalName: "red wine"
  -> category: "beverages"
  -> confidence: 0.82

[OK] "Kinder's The Taco Blend Mexican Seasoning"
  -> canonicalName: "taco seasoning"
  -> category: "spices"
  -> confidence: 0.80

[OK] "Real Mayo"
  -> canonicalName: "mayonnaise"
  -> category: "condiments"
  -> confidence: 0.86

[OK] "cage free large white egg"
  -> canonicalName: "egg"
  -> category: "dairy"
  -> confidence: 0.90

[OK] "1 low fat milk"
  -> canonicalName: "low fat milk"
  -> category: "dairy"
  -> confidence: 0.86

[OK] "Lemon Ginger Cayenne Juice Beverage 10.5 Fl Oz"
  -> canonicalName: "lemon ginger cayenne juice"  ← NOT "lemon juice" — preserve all flavor modifiers
  -> category: "beverages"
  -> confidence: 0.76

**Non-Food Items (ALL contexts):**

[X] "Bounty paper towels"
  -> canonicalName: "paper towel"
  -> category: null
  -> confidence: 0.0

[X] "Dawn dish soap"
  -> canonicalName: "dish soap"
  -> category: null
  -> confidence: 0.0

[X] "Charmin toilet paper"
  -> canonicalName: "toilet paper"
  -> category: null
  -> confidence: 0.0
`

export const EDGE_CASES_SECTION = `
===============================================================
HANDLING EDGE CASES:
===============================================================

**1. Ambiguous Items (keep distinctions):**
   - "butter" vs "peanut butter" vs "almond butter" -> Keep all separate
   - "cream" vs "heavy cream" vs "sour cream" vs "cream cheese" -> Keep all separate
   - "milk" vs "almond milk" vs "coconut milk" -> Keep all separate

**2. Compound Items:**
   - "salt and pepper" -> Return TWO separate items with id suffixes:
     * id: "123-1", canonicalName: "salt"
     * id: "123-2", canonicalName: "pepper"
   - "lettuce and tomato" -> TWO items: "lettuce" and "tomato"
   - Common pairings that ARE one product: "peanut butter", "cream cheese", "soy sauce"

**3. Unknown Food Items:**
   - If you don't recognize it but it SEEMS like food: confidence 0.5-0.7
   - Clean it up (lowercase, singular, remove brands) and let human review
   - DON'T invent fake categories - use "other" if unsure
   - canonicalName must be a real ingredient phrase, never a category label like "other"
   - Prefer short archetypes over long product strings (e.g. "red wine", "swiss cheese", "tuna")

**4. Abbreviations:**
   - "evoo" -> "olive oil"
   - "pb" -> "peanut butter"
   - "ap flour" -> "all-purpose flour"
   - "xvoo" -> "extra virgin olive oil" -> "olive oil"

**5. Canned/Packaged Versions of Fresh Items:**
   - "canned tomatoes" -> "tomato" (the form doesn't matter for price comparison)
   - "frozen peas" -> "peas"
   - "canned tuna" -> "tuna"
   - Exception: If the preserved form is significantly different: "sun-dried tomato"
`

export const OUTPUT_FORMAT_SECTION = `
===============================================================
OUTPUT FORMAT:
===============================================================

Return ONLY valid JSON (no markdown, no code blocks, no preamble) as an array:

[
  {
    "id": "input-id",
    "originalName": "original input text",
    "canonicalName": "cleaned canonical name",
    "isFoodItem": true,
    "category": "category_enum_value or null",
    "confidence": 0.92
  }
]

**For compound items**, split into multiple entries with id suffixes:
[
  {
    "id": "123-1",
    "originalName": "salt and pepper",
    "canonicalName": "salt",
    "isFoodItem": true,
    "category": "pantry_staples",
    "confidence": 0.95
  },
  {
    "id": "123-2",
    "originalName": "salt and pepper",
    "canonicalName": "pepper",
    "isFoodItem": true,
    "category": "pantry_staples",
    "confidence": 0.95
  }
]

**For non-food items**, always set isFoodItem to false plus category: null and confidence near 0:
[
  {
    "id": "456",
    "originalName": "paper towels",
    "canonicalName": "paper towel",
    "isFoodItem": false,
    "category": null,
    "confidence": 0.0
  }
]
`
