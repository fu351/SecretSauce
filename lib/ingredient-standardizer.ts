import axios from "axios"
import { createServerClient } from "./supabase"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

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

export interface IngredientStandardizationResult {
  id: string
  originalName: string
  canonicalName: string
  category?: string | null
  confidence: number
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  return Promise.race([promise, timeout])
}

async function fetchCanonicalIngredients(sampleSize = 200): Promise<string[]> {
  try {
    const client = createServerClient()
    const { data, error } = await client
      .from("standardized_ingredients")
      .select("canonical_name")
      .limit(sampleSize)

    if (error || !data) {
      console.warn("[IngredientStandardizer] Unable to load canonical list:", error)
      return []
    }

    return data
      .map((row) => row.canonical_name)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
  } catch (error) {
    console.warn("[IngredientStandardizer] Error loading canonical list:", error)
    return []
  }
}

function buildPrompt(inputs: StandardizerIngredientInput[], canonicalNames: string[], context: "recipe" | "pantry") {
  const canonicalList =
    canonicalNames.length > 0 ? canonicalNames.slice(0, 150).join(", ") : "No canonical list provided"

  const formattedInputs = inputs.map((item, index) => ({
    id: item.id || String(index),
    name: item.name,
    amount: item.amount || "",
    unit: item.unit || "",
  }))

  return `
You are an ingredient normalizer helping a cooking app map free-form ${context} entries to canonical grocery ingredients.

EXISTING canonical ingredients (MUST match to these when possible): ${canonicalList}

Instructions:
1. ALWAYS try to match to an existing canonical ingredient from the list above first.
2. Strip away preparation methods and descriptors: chopped, minced, diced, sliced, grated, shredded, crushed, cooked, raw, large, small, ripe, etc.
3. Remove qualifiers like "to taste", "optional", "for garnish", "divided", etc.
4. Keep ingredient names SPECIFIC ENOUGH to be useful for grocery shopping:
   - "grated parmesan cheese" → "parmesan cheese" (NOT just "cheese")
   - "dry white wine" → "white wine" (NOT just "wine")
   - "fresh basil leaves" → "basil"
   - "chopped yellow onion" → "onion"
   - "boneless skinless chicken breast" → "chicken breast"
   - "extra virgin olive oil" → "olive oil"
   - "salt and black pepper to taste" → "salt and pepper"
5. For each input, return a canonical grocery ingredient name (singular, lowercase).
6. If no existing match, create a new canonical name that is specific enough to find in a grocery store.
7. REQUIRED: Include a specific category from ONLY these options: produce, dairy, meat & seafood, pantry staples, frozen, beverages, snacks, condiments, baking. NEVER use "other" - always pick the most appropriate category.
8. Output confidence between 0 and 1 (higher if matched to existing canonical).
9. Return ONLY valid JSON (no markdown) as an array of objects using this shape:
   [{"id":"input-id","originalName":"original input","canonicalName":"canonical","category":"category","confidence":0.92}]

Inputs:
${JSON.stringify(formattedInputs, null, 2)}
`
}

function fallbackResults(inputs: IngredientInput[]): IngredientStandardizationResult[] {
  return inputs.map((item, index) => ({
    id: item.id || String(index),
    originalName: item.name,
    canonicalName: item.name.toLowerCase(),
    category: null,
    confidence: 0.2,
  }))
}

export async function standardizeIngredientsWithAI(
  inputs: IngredientInput[],
  context: "recipe" | "pantry"
): Promise<IngredientStandardizationResult[]> {
  if (!inputs || inputs.length === 0) {
    return []
  }

  if (!OPENAI_API_KEY) {
    console.warn("[IngredientStandardizer] OPENAI_API_KEY missing; returning fallback mappings")
    return fallbackResults(inputs)
  }

  try {
    const canonicalList = await fetchCanonicalIngredients()
    const prompt = buildPrompt(inputs, canonicalList, context)

    const response = await withTimeout(
      axios.post(
        OPENAI_URL,
        {
          model: "gpt-4o-mini",
          temperature: 0.1,
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
      ),
      20000,
    )

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      console.warn("[IngredientStandardizer] OpenAI returned empty content")
      return fallbackResults(inputs)
    }

    const cleaned = content.replace(/```json|```/gi, "").trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) {
      console.warn("[IngredientStandardizer] OpenAI payload was not an array")
      return fallbackResults(inputs)
    }

    return parsed
      .map((item: any, index: number) => {
        const input = inputs[index]
        const id = String(item.id ?? input.id ?? index)
        const originalName = typeof item.originalName === "string" ? item.originalName : input.name
        const canonicalName =
          typeof item.canonicalName === "string" && item.canonicalName.trim().length > 0
            ? item.canonicalName.toLowerCase()
            : input.name.toLowerCase()
        const category = typeof item.category === "string" ? item.category : null
        const confidence =
          typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : 0.5

        return { id, originalName, canonicalName, category, confidence }
      })
      .filter((item) => !!item.canonicalName)
  } catch (error) {
    console.error("[IngredientStandardizer] Failed to call OpenAI:", error)
    return fallbackResults(inputs)
  }
}
