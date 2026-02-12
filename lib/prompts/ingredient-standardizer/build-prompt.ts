import type { IngredientStandardizerContext } from "../../utils/ingredient-standardizer-context"
import type { IngredientStandardizerContextRules } from "../../utils/ingredient-standardizer-context"
import {
  CATEGORY_ASSIGNMENT_SECTION,
  EDGE_CASES_SECTION,
  EXAMPLES_SECTION,
  NORMALIZATION_RULES_SECTION,
  OUTPUT_FORMAT_SECTION,
} from "./sections"

export interface IngredientStandardizerPromptInput {
  id: string
  name: string
  amount?: string
  unit?: string
}

interface BuildIngredientStandardizerPromptParams {
  inputs: IngredientStandardizerPromptInput[]
  canonicalNames: string[]
  context: IngredientStandardizerContext
  contextRules: IngredientStandardizerContextRules
}

export function buildIngredientStandardizerPrompt({
  inputs,
  canonicalNames,
  context,
  contextRules,
}: BuildIngredientStandardizerPromptParams): string {
  const canonicalList =
    canonicalNames.length > 0 ? canonicalNames.slice(0, 200).join(", ") : "No canonical list provided"

  const formattedInputs = inputs.map((item, index) => ({
    id: item.id || String(index),
    name: item.name,
    amount: item.amount || "",
    unit: item.unit || "",
  }))

  return `
You are an expert ingredient normalizer for a grocery price comparison system. Your job is to map ingredient names to canonical forms that enable accurate price tracking across stores and recipes.

**DATABASE CONTEXT:**
- You're standardizing to match entries in the 'standardized_ingredients' table
- Each canonical ingredient has: id, canonical_name, category, default_unit, estimated_unit_weight_oz
- The system uses these standardized names to compare prices across stores and calculate shopping lists
- Your output feeds into price comparison algorithms and shopping list generation

**CURRENT CONTEXT: ${context.toUpperCase()}**
${contextRules.contextGuidance}

**EXISTING CANONICAL INGREDIENTS (${canonicalNames.length} total):**
${canonicalList}

===============================================================
CRITICAL RULES:
===============================================================

**1. FOOD vs NON-FOOD:**
   ${contextRules.foodVsNonFoodRule}
   
   [X] REJECT (confidence 0.0-0.2, category: null):
   - Household: paper towels, foil, plastic wrap, trash bags, cleaning supplies
   - Personal care: soap, shampoo, toothpaste, medicine, vitamins
   - Pet supplies: dog food, cat litter, pet treats
   - Kitchen items: pans, utensils, containers
   - Other: batteries, light bulbs, gift cards

   [OK] ACCEPT: All foods, beverages, spices, condiments for human consumption

**2. MATCH EXISTING FIRST:**
   - ALWAYS prioritize exact or close matches to the canonical list above
   - "yellow onion" -> "onion" (if "onion" exists in canonical list)
   - "sharp cheddar" -> "cheddar cheese" (if exists)
   - Only create NEW canonical names when no reasonable match exists

${NORMALIZATION_RULES_SECTION}

**4. PACKAGED CONVENIENCE FOODS & MEAL KITS:**

${contextRules.convenienceFoodsRules}

${CATEGORY_ASSIGNMENT_SECTION}

**6. CONFIDENCE SCORING:**
   - **0.95-1.0**: Exact match to existing canonical ingredient
   - **0.85-0.94**: Close match with minor normalization (e.g., "organic basil" -> "basil")
   - **0.70-0.84**: Good match but required significant cleanup (e.g., "Kraft sharp cheddar" -> "cheddar cheese")
   - **0.50-0.69**: New canonical name, clearly a food ingredient, no existing match
   - **0.40-0.49**: ${contextRules.lowConfidenceBandLabel} - goes to ingredient_match_queue
   - **0.30-0.39**: Ambiguous or unclear ingredient - needs human review
   - **0.00-0.29**: Non-food item or invalid input (REJECT, category: null)

${EXAMPLES_SECTION}

${EDGE_CASES_SECTION}

${OUTPUT_FORMAT_SECTION}

===============================================================
INPUTS TO PROCESS (Context: ${context}):
===============================================================

${JSON.stringify(formattedInputs, null, 2)}
`
}
