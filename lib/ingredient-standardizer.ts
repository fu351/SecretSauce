import axios from "axios"
import { GoogleGenAI } from "@google/genai"
import { standardizedIngredientsDB } from "./database/standardized-ingredients-db"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim()
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview"
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION?.trim()

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

const geminiClient = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      ...(GEMINI_API_VERSION ? { apiVersion: GEMINI_API_VERSION } : {}),
    })
  : null

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

async function callGemini(prompt: string): Promise<string | null> {
  if (!geminiClient) return null

  try {
    const response = await withTimeout(
      geminiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
        },
      }),
      20000
    )

    const text = response.text?.trim()

    if (!text) {
      console.warn("[callGemini] Empty response from Gemini")
      return null
    }

    // Validate it looks like JSON
    if (!text.startsWith('[') && !text.startsWith('{')) {
      console.warn("[callGemini] Response doesn't look like JSON:", text.substring(0, 100))
    }

    return text
  } catch (error) {
    console.error("[callGemini] Request failed:", error)
    return null
  }
}

function buildPrompt(inputs: StandardizerIngredientInput[], canonicalNames: string[], context: "recipe" | "pantry") {
  const canonicalList =
    canonicalNames.length > 0 ? canonicalNames.slice(0, 200).join(", ") : "No canonical list provided"

  const formattedInputs = inputs.map((item, index) => ({
    id: item.id || String(index),
    name: item.name,
    amount: item.amount || "",
    unit: item.unit || "",
  }))

  return `
You are an expert ingredient normalizer for a grocery shopping app. Your job is to identify and standardize FOOD ITEMS ONLY from ${context} ingredient lists, mapping them to canonical grocery store items.

EXISTING CANONICAL INGREDIENTS (${canonicalNames.length} total):
${canonicalList}

⚠️ CRITICAL RULE: ONLY process items that are FOOD or BEVERAGES intended for human consumption.

═══════════════════════════════════════════════════════════════
REJECT NON-FOOD ITEMS - Set confidence to 0.0-0.2 for:
═══════════════════════════════════════════════════════════════

❌ Household supplies: paper towels, napkins, plastic wrap, aluminum foil, trash bags, cleaning products
❌ Personal care: soap, shampoo, toothpaste, deodorant, lotion, cosmetics, vitamins, medicine
❌ Pet supplies: dog food, cat litter, pet treats
❌ Baby products: diapers, wipes, formula (unless clearly food-related)
❌ Kitchen items: pans, utensils, dishes, storage containers
❌ Other: batteries, light bulbs, magazines, gift cards

✓ ACCEPT: All foods, beverages, cooking ingredients, spices, condiments that humans eat/drink

═══════════════════════════════════════════════════════════════
NORMALIZATION RULES FOR VALID FOOD ITEMS:
═══════════════════════════════════════════════════════════════

1. **Match Existing First**: ALWAYS prioritize matching to the canonical list above. Use exact matches when possible.

2. **Strip Preparation Methods**: Remove cooking/prep terms that don't affect what you buy:
   - Chopped, minced, diced, sliced, grated, shredded, crushed
   - Cooked, raw, steamed, boiled, roasted, grilled
   - Example: "chopped yellow onion" → "onion"

3. **Strip Descriptive Qualifiers**: Remove non-essential adjectives:
   - Size: large, small, medium, jumbo
   - Quality: fresh, organic, premium, extra, fancy
   - Freshness: ripe, unripe, day-old
   - Optional modifiers: to taste, optional, divided, if needed
   - Example: "large organic red tomatoes" → "tomato"

4. **Preserve Important Varieties**: Keep distinctions that matter for shopping:
   - Types of meat: "chicken breast" not just "chicken"
   - Cheese varieties: "parmesan cheese" not just "cheese"
   - Wine types: "white wine" not just "wine"
   - Flour types: "all-purpose flour" vs "bread flour"
   - Oil types: "olive oil" vs "vegetable oil"

5. **Remove Brand Names**: Strip commercial brands but keep product type:
   - "Kraft cheddar cheese" → "cheddar cheese"
   - "Heinz ketchup" → "ketchup"
   - "Coca-Cola" → "cola" or "soda"

6. **Use Singular Form**: Convert plurals to singular:
   - "tomatoes" → "tomato"
   - "apples" → "apple"
   - Exception: Items typically sold/used plural (e.g., "green beans")

7. **Lowercase Everything**: All canonical names must be lowercase

8. **Handle Compound Items**:
   - Common pairings: "salt and pepper" → keep as one item
   - Separate items: "lettuce and tomato" → process separately if they're not typically bundled

9. **Categories**: Assign the MOST SPECIFIC category from these options:
   - produce: fruits, vegetables, fresh herbs
   - dairy: milk, cheese, yogurt, butter, eggs
   - meat_seafood: all meats, poultry, fish, seafood
   - pantry_staples: flour, sugar, salt, oil, rice, pasta, canned goods
   - beverages: drinks, juice, soda, coffee, tea (excluding milk)
   - snacks: chips, crackers, cookies, candy
   - condiments: sauces, dressings, ketchup, mustard, mayo
   - baking: baking powder, vanilla extract, chocolate chips
   - other: items that don't fit above categories

10. **Confidence Scoring**:
    - 0.9-1.0: Exact match to existing canonical ingredient
    - 0.7-0.9: Close match with minor normalization needed
    - 0.5-0.7: New canonical name but clearly a food ingredient
    - 0.3-0.5: Ambiguous or unclear ingredient (might be food)
    - 0.0-0.2: Non-food item or invalid input (REJECT THESE)

═══════════════════════════════════════════════════════════════
EXAMPLES OF PROPER NORMALIZATION:
═══════════════════════════════════════════════════════════════

✓ "grated parmesan cheese, divided" → "parmesan cheese" (confidence: 0.85)
✓ "2 large organic yellow onions, chopped" → "onion" (confidence: 0.90)
✓ "boneless skinless chicken breast" → "chicken breast" (confidence: 0.88)
✓ "Kraft extra sharp cheddar cheese" → "cheddar cheese" (confidence: 0.85)
✓ "fresh basil leaves" → "basil" (confidence: 0.92)
✓ "kosher salt to taste" → "salt" (confidence: 0.95)

❌ "Bounty paper towels" → "paper towel" (confidence: 0.0, category: null)
❌ "Dawn dish soap" → "dish soap" (confidence: 0.0, category: null)
❌ "Charmin toilet paper" → "toilet paper" (confidence: 0.0, category: null)

═══════════════════════════════════════════════════════════════
NORMALIZATION SAFETY:
═══════════════════════════════════════════════════════════════

• Never invent “other,” “misc,” “unknown,” or similar catch-all canonicals for clearly edible inputs. Only use those labels when you are certain the item is not meant for human food/beverage (confidence 0.0‑0.2 and category null).
• When you can’t find a match, return the cleaned ingredient (lowercased, singular, brandless) as the canonical name and give it a confidence of 0.5–0.7 so the resolver can decide whether to upsert a new canonical row.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks) as an array:
[{"id":"input-id","originalName":"original input","canonicalName":"canonical","category":"category","confidence":0.92}]

For NON-FOOD items, still return them with:
- canonicalName: lowercase version of input
- category: null
- confidence: 0.0 to 0.2

Inputs to process:
${JSON.stringify(formattedInputs, null, 2)}
`
}

function fallbackResults(inputs: StandardizerIngredientInput[]): IngredientStandardizationResult[] {
  return inputs.map((item, index) => ({
    id: item.id || String(index),
    originalName: item.name,
    canonicalName: item.name.toLowerCase(),
    category: null,
    confidence: 0.2,
  }))
}

export async function standardizeIngredientsWithAI(
  inputs: StandardizerIngredientInput[],
  context: "recipe" | "pantry"
): Promise<IngredientStandardizationResult[]> {
  if (!inputs || inputs.length === 0) {
    return []
  }

  const hasGemini = Boolean(GEMINI_API_KEY)
  const hasOpenAI = Boolean(OPENAI_API_KEY)

  if (!hasGemini && !hasOpenAI) {
    console.warn(
      "[IngredientStandardizer] GEMINI_API_KEY and OPENAI_API_KEY missing; returning fallback mappings"
    )
    return fallbackResults(inputs)
  }

  // Determine which provider to use (OpenAI preferred)
  const useOpenAI = hasOpenAI
  const aiProvider: "Gemini" | "OpenAI" = useOpenAI ? "OpenAI" : "Gemini"
  const requestFn = useOpenAI ? callOpenAI : callGemini

  console.log(`[IngredientStandardizer] Using ${aiProvider} for ${inputs.length} ingredients`)

  try {
    const canonicalList = await fetchCanonicalIngredients()
    const prompt = buildPrompt(inputs, canonicalList, context)
    const content = await withTimeout(requestFn(prompt), 20000)

    if (!content) {
      console.warn(`[IngredientStandardizer] ${aiProvider} returned empty content`)
      return fallbackResults(inputs)
    }

    // Extract JSON from response
    const extracted = extractJSON(content)
    if (!extracted) {
      console.error(`[IngredientStandardizer] ${aiProvider} - Could not extract JSON from response`)
      console.error(`[IngredientStandardizer] Response preview: ${content.substring(0, 200)}...`)
      return fallbackResults(inputs)
    }

    // Parse with error handling
    let parsed: any
    try {
      parsed = JSON.parse(extracted)
    } catch (parseError) {
      console.error(`[IngredientStandardizer] ${aiProvider} - JSON parse error:`, parseError)
      console.error(`[IngredientStandardizer] Attempted to parse: ${extracted.substring(0, 300)}...`)
      return fallbackResults(inputs)
    }

    const resultEntries: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : []

    if (resultEntries.length === 0) {
      console.warn(`[IngredientStandardizer] ${aiProvider} payload contained no results`)
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

      const canonicalSource =
        useEntry && typeof entry?.canonicalName === "string"
          ? entry.canonicalName
          : useEntry && typeof entry?.canonical === "string"
            ? entry.canonical
            : undefined
      const canonicalCandidate = canonicalSource?.trim().toLowerCase()
      const canonicalName =
        canonicalCandidate && canonicalCandidate.length > 0 ? canonicalCandidate : input.name.toLowerCase()

      const confidence = useEntry
        ? parseConfidence(entry?.confidence ?? entry?.confidenceScore, 0.5)
        : 0.2
      const category = useEntry && typeof entry?.category === "string" ? entry.category : null
      const originalName =
        typeof entry?.originalName === "string" ? entry.originalName : input.name

      return {
        id: String(entry?.id ?? entry?.rowId ?? input.id ?? index),
        originalName,
        canonicalName,
        category,
        confidence,
      }
    })
  } catch (error) {
    console.error(`[IngredientStandardizer] ${aiProvider} failed:`, error)
    console.error(`[IngredientStandardizer] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`)

    // Try fallback provider if available
    if (useOpenAI && hasGemini) {
      console.log(`[IngredientStandardizer] Attempting fallback to Gemini...`)
      // Could implement fallback logic here
    } else if (!useOpenAI && hasOpenAI) {
      console.log(`[IngredientStandardizer] Attempting fallback to OpenAI...`)
      // Could implement fallback logic here
    }

    return fallbackResults(inputs)
  }
}
