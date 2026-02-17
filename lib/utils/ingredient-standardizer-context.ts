export type IngredientStandardizerContext = "recipe" | "pantry"

export interface IngredientStandardizerContextRules {
  contextGuidance: string
  foodVsNonFoodRule: string
  convenienceFoodsRules: string
  lowConfidenceBandLabel: string
}

export function resolveIngredientStandardizerContext(
  context: string | null | undefined
): IngredientStandardizerContext {
  const normalizedContext = String(context || "").trim().toLowerCase()

  switch (normalizedContext) {
    case "recipe":
      return "recipe"
    case "pantry":
      return "pantry"
    default:
      return "pantry"
  }
}

export function getIngredientStandardizerContextRules(
  context: IngredientStandardizerContext
): IngredientStandardizerContextRules {
  switch (context) {
    case "recipe":
      return {
        contextGuidance: `**RECIPE CONTEXT**: Ingredients should be RAW, BASIC food items only.
- REJECT packaged meal kits, pre-seasoned mixes, branded convenience foods
- If you see "Helper", "Mix", "Kit", "Meal Kit", "Sides" -> LOW confidence (0.40-0.50)
- Strip to base ingredient: "Hamburger Helper Beef Stroganoff" -> "pasta"
- These indicate bad recipe data and should be flagged for manual review in ingredient_match_queue`,
        foodVsNonFoodRule:
          "- ONLY process FOOD items meant for human consumption\n   - Recipes should NEVER contain household supplies",
        convenienceFoodsRules: `
   [Warning] **RECIPE CONTEXT - These are RED FLAGS:**
   
   Packaged meal kits RARELY belong in real recipes. If you encounter:
   - "[Brand] Helper" (Hamburger Helper, Tuna Helper)
   - "[Brand] Sides" (Rice-A-Roni, Pasta Roni, Knorr Rice Sides)
   - "[Anything] Meal Kit"
   - "[Anything] Mix" (unless it's a dry ingredient like "flour mix")
   - Pre-seasoned pouches (flavored tuna, rice pouches)
   
   **Handle as follows:**
   - Confidence: 0.40-0.50 (flags for ingredient_match_queue review)
   - Strip to BASE ingredient only:
     * "Hamburger Helper Beef Stroganoff" -> "pasta"
     * "Rice-A-Roni Chicken Flavor" -> "rice"
     * "StarKist Herb & Garlic Tuna Pouch" -> "tuna"
     * "Betty Crocker Brownie Mix" -> "brownie mix" (OK - this is a baking mix)
   - These likely indicate bad recipe scraping or user error
   
   **Examples:**
   
   ? "1 box Hamburger Helper Deluxe Beef Stroganoff Pasta Meal Kit"
     -> canonicalName: "pasta"
     -> category: "pantry_staples"
     -> confidence: 0.45
     -> [Warning] Low confidence will flag for manual review
   
   ? "90 Second Long Grain & Wild Rice with Herbs Microwavable Pouch"
     -> canonicalName: "rice"
     -> category: "pantry_staples"
     -> confidence: 0.45
   
   ? "StarKist Tuna Creations Herb & Garlic Pouch"
     -> canonicalName: "tuna"
     -> category: "pantry_staples"
     -> confidence: 0.48
   
   [OK] "Betty Crocker Brownie Mix" (baking mixes ARE legitimate)
     -> canonicalName: "brownie mix"
     -> category: "baking"
     -> confidence: 0.75
   `,
        lowConfidenceBandLabel: "Convenience food in recipe (red flag)",
      }
    case "pantry":
      return {
        contextGuidance: `**PANTRY CONTEXT**: Users may have purchased convenience products.
- Packaged meal kits, rice sides, flavored pouches are ACCEPTABLE
- Keep canonical names concise (usually 1-4 words), not full product titles
- Normalize to product archetype when needed: "Hamburger Helper Beef Stroganoff" -> "pasta kit"
- Normal confidence for these: 0.65-0.75`,
        foodVsNonFoodRule:
          "- PRIMARILY process FOOD items\n   - Non-food items (household supplies, personal care, pet supplies, etc.) must be REJECTED with confidence 0.0-0.2 and category: null, even in pantry context",
        convenienceFoodsRules: `
   [OK] **PANTRY CONTEXT - These are ACCEPTABLE:**
   
   Users DO purchase convenience foods. Handle with normal confidence:
   
   **Rules:**
   1. Remove brand names (always)
   2. Keep product archetype + essential ingredient words
   3. Remove marketing language (Deluxe, Creations, 90 Second, etc.)
   4. Remove packaging/count/size/vintage noise (11 slices, 6 ct, 2024, 750ml)
   5. Avoid full retail-title canonicals; keep output concise
   6. Confidence: 0.65-0.75 (normal for packaged foods)
   
   **Examples:**
   
   [OK] "Hamburger Helper Deluxe Beef Stroganoff Pasta Meal Kit - 5.5oz"
     -> canonicalName: "pasta kit"
     -> category: "pantry_staples"
     -> confidence: 0.70
   
   [OK] "90 Second Long Grain & Wild Rice with Herbs & Seasonings Pouch"
     -> canonicalName: "wild rice mix"
     -> category: "pantry_staples"
     -> confidence: 0.72
   
   [OK] "StarKist Tuna Creations Herb & Garlic Pouch - 2.6oz"
     -> canonicalName: "tuna"
     -> category: "pantry_staples"
     -> confidence: 0.68
   
   [OK] "Knorr Rice Sides Chicken Flavor - 5.7oz"
     -> canonicalName: "rice side"
     -> category: "pantry_staples"
     -> confidence: 0.70
   
   [OK] "Campbell's Condensed Tomato Soup - 10.75oz"
     -> canonicalName: "tomato soup"
     -> category: "pantry_staples"
     -> confidence: 0.85

   [OK] "Charles Shaw Nouveau Red Table Wine 2024"
     -> canonicalName: "red wine"
     -> category: "beverages"
     -> confidence: 0.82

   [OK] "Sargento Baby Swiss Sliced Cheese 11 slices"
     -> canonicalName: "swiss cheese"
     -> category: "dairy"
     -> confidence: 0.88

   [OK] "Real Mayo"
     -> canonicalName: "mayonnaise"
     -> category: "condiments"
     -> confidence: 0.86
   `,
        lowConfidenceBandLabel: "Ambiguous ingredient",
      }
    default: {
      const exhaustiveCheck: never = context
      throw new Error(`Unhandled context: ${exhaustiveCheck}`)
    }
  }
}
