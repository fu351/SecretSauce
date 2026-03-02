import axios from "axios"
import { standardizedIngredientsDB } from "../lib/database/standardized-ingredients-db"
import { buildIngredientStandardizerPrompt } from "./prompts/ingredient/build-prompt"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"

// ---------------------------------------------------------------------------
// Context types (previously in lib/utils/ingredient-standardizer-context.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core ingredient standardizer
// ---------------------------------------------------------------------------

/**
 * Standardizer Ingredient Input Type
 *
 * Ingredient input specific to the standardizer service.
 * Private interface kept separate from general ingredient types
 * to avoid conflicts with form-level IngredientFormInput.
 */
interface StandardizerIngredientInput {
  id: string
  name: string
  amount?: string
  unit?: string
}

function normalizeCanonicalOutput(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[Ææ]/g, "ae")
    .replace(/[Œœ]/g, "oe")
    .replace(/[Øø]/g, "o")
    .replace(/[Łł]/g, "l")
    .replace(/[Đđ]/g, "d")
    .replace(/[Þþ]/g, "th")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export interface IngredientStandardizationResult {
  id: string
  originalName: string
  canonicalName: string
  isFoodItem: boolean
  category?: string | null
  confidence: number
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  return Promise.race([promise, timeout])
}

/**
 * Extracts JSON from AI response, handling various formats
 * Returns null if no valid JSON found
 */
function extractJSON(content: string): string | null {
  if (!content) return null

  // Remove markdown code blocks
  let cleaned = content.replace(/```json\n?|```/gi, "").trim()

  // Try to find JSON array or object
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)

  // Prefer array (expected format) over object
  if (arrayMatch) {
    return arrayMatch[0]
  } else if (objectMatch) {
    return objectMatch[0]
  }

  // If no clear boundaries, assume entire cleaned string
  return cleaned
}

async function fetchCanonicalIngredients(sampleSize = 200): Promise<string[]> {
  // Directly call the singleton instance
  const names = await standardizedIngredientsDB.getCanonicalNameSample(sampleSize)

  if (names.length === 0) {
    console.warn("[IngredientStandardizer] Found no canonical ingredients for sample")
  }

  return names
}

async function callOpenAI(prompt: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null

  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content: "You standardize ingredient names for a cooking application and always return valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    )

    const content = response.data?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      console.warn("[callOpenAI] Empty response from OpenAI")
      return null
    }

    // Validate it looks like JSON
    if (!content.startsWith('[') && !content.startsWith('{')) {
      console.warn("[callOpenAI] Response doesn't look like JSON:", content.substring(0, 100))
    }

    return content
  } catch (error) {
    console.error("[callOpenAI] Request failed:", error)
    return null
  }
}

function buildPrompt(inputs: StandardizerIngredientInput[], canonicalNames: string[], context: IngredientStandardizerContext) {
  const contextRules = getIngredientStandardizerContextRules(context)
  return buildIngredientStandardizerPrompt({
    inputs,
    canonicalNames,
    context,
    contextRules,
  })
}

function fallbackResults(inputs: StandardizerIngredientInput[]): IngredientStandardizationResult[] {
  return inputs.map((item, index) => ({
    id: item.id || String(index),
    originalName: item.name,
    canonicalName: normalizeCanonicalOutput(item.name) || item.name.toLowerCase(),
    isFoodItem: true,
    category: null,
    confidence: 0.2,
  }))
}

export async function standardizeIngredientsWithAI(
  inputs: StandardizerIngredientInput[],
  context: IngredientStandardizerContext
): Promise<IngredientStandardizationResult[]> {
  if (!inputs || inputs.length === 0) {
    return []
  }

  if (!OPENAI_API_KEY) {
    console.warn("[IngredientStandardizer] OPENAI_API_KEY missing; returning fallback mappings")
    return fallbackResults(inputs)
  }

  console.log(`[IngredientStandardizer] Using OpenAI for ${inputs.length} ingredients`)

  try {
    const canonicalList = await fetchCanonicalIngredients()
    const prompt = buildPrompt(inputs, canonicalList, context)
    const content = await withTimeout(callOpenAI(prompt), 20000)

    if (!content) {
      console.warn("[IngredientStandardizer] OpenAI returned empty content")
      return fallbackResults(inputs)
    }

    // Extract JSON from response
    const extracted = extractJSON(content)
    if (!extracted) {
      console.error("[IngredientStandardizer] OpenAI - Could not extract JSON from response")
      console.error(`[IngredientStandardizer] Response preview: ${content.substring(0, 200)}...`)
      return fallbackResults(inputs)
    }

    // Parse with error handling
    let parsed: any
    try {
      parsed = JSON.parse(extracted)
    } catch (parseError) {
      console.error("[IngredientStandardizer] OpenAI - JSON parse error:", parseError)
      console.error(`[IngredientStandardizer] Attempted to parse: ${extracted.substring(0, 300)}...`)
      return fallbackResults(inputs)
    }

    const resultEntries: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : []

    if (resultEntries.length === 0) {
      console.warn("[IngredientStandardizer] OpenAI payload contained no results")
      return fallbackResults(inputs)
    }

    const entriesById = new Map<string, any>()
    resultEntries.forEach((entry) => {
      if (!entry) return
      const entryId =
        typeof entry.id === "string"
          ? entry.id
          : typeof entry.rowId === "string"
            ? entry.rowId
            : undefined
      if (entryId) {
        entriesById.set(entryId, entry)
      }
    })

    const parseConfidence = (value: unknown, fallback: number): number => {
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? parseFloat(value)
            : NaN
      return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : fallback
    }

    return inputs.map((input, index) => {
      const entry = entriesById.get(input.id) ?? resultEntries[index]
      const status = typeof entry?.status === "string" ? entry.status.toLowerCase() : "success"
      const useEntry = Boolean(entry && status === "success")
      const modelId =
        typeof entry?.id === "string"
          ? entry.id
          : typeof entry?.rowId === "string"
            ? entry.rowId
            : null

      if (modelId && modelId !== input.id) {
        console.warn(
          `[IngredientStandardizer] Model id mismatch for "${input.name}": expected "${input.id}", got "${modelId}". Using expected id.`
        )
      }

      const canonicalSource =
        useEntry && typeof entry?.canonicalName === "string"
          ? entry.canonicalName
          : useEntry && typeof entry?.canonical === "string"
            ? entry.canonical
            : undefined
      const canonicalCandidate = normalizeCanonicalOutput(canonicalSource || "")
      const canonicalName =
        canonicalCandidate && canonicalCandidate.length > 0
          ? canonicalCandidate
          : normalizeCanonicalOutput(input.name) || input.name.toLowerCase()

      const confidence = useEntry
        ? parseConfidence(entry?.confidence ?? entry?.confidenceScore, 0.5)
        : 0.2
      const isFoodItem = useEntry
        ? typeof entry?.isFoodItem === "boolean"
          ? entry.isFoodItem
          : typeof entry?.is_food_item === "boolean"
            ? entry.is_food_item
            : true
        : true
      const category =
        isFoodItem && useEntry && typeof entry?.category === "string" ? entry.category : null
      const originalName =
        typeof entry?.originalName === "string" ? entry.originalName : input.name

      return {
        // Keep the original input id stable. Some model outputs emit rewritten ids,
        // which breaks downstream row mapping in queue processing.
        id: String(input.id ?? index),
        originalName,
        canonicalName,
        isFoodItem,
        category,
        confidence,
      }
    })
  } catch (error) {
    console.error("[IngredientStandardizer] OpenAI failed:", error)
    console.error(`[IngredientStandardizer] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`)
    return fallbackResults(inputs)
  }
}
