import axios from "axios"
import { standardizedIngredientsDB } from "./database/standardized-ingredients-db"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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
  // Directly call the singleton instance
  const names = await standardizedIngredientsDB.getCanonicalNameSample(sampleSize)
  
  if (names.length === 0) {
    console.warn("[IngredientStandardizer] Found no canonical ingredients for sample")
  }
  
  return names
}

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null

  const url = `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`
  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000, // Increased slightly for large batches
        responseMimeType: "application/json", // This is the "Proper" way
      },
    },
    { headers: { "Content-Type": "application/json" } }
  )

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
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
You are an ingredient normalizer for a grocery shopping app. Your job is to map ${context} ingredient names to canonical grocery store items.

EXISTING CANONICAL INGREDIENTS (${canonicalNames.length} total):
${canonicalList}

CRITICAL: When an input closely matches an existing canonical ingredient, you MUST use that exact match. Only create new canonical names when no reasonable match exists.

Normalization Rules:
1. **Match Existing First**: ALWAYS prioritize matching to the canonical list above. Use exact matches when possible.
2. **Strip Preparation**: Remove preparation methods: chopped, minced, diced, sliced, grated, shredded, crushed, cooked, raw, etc.
3. **Strip Qualifiers**: Remove descriptors: fresh, dried, large, small, ripe, organic, to taste, optional, divided, etc.
4. **Remove Brands**: Strip brand names (e.g., "Kraft cheddar cheese" → "cheddar cheese")
5. **Singular Form**: Use singular, not plural (e.g., "tomatoes" → "tomato")
6. **Lowercase**: All canonical names must be lowercase
7. **Keep Specificity**: Maintain enough detail for grocery shopping:
   ✓ "grated parmesan cheese" → "parmesan cheese" (NOT "cheese")
   ✓ "dry white wine" → "white wine" (NOT "wine")
   ✓ "fresh basil leaves" → "basil"
   ✓ "yellow onion, chopped" → "onion"
   ✓ "boneless skinless chicken breast" → "chicken breast"
   ✓ "extra virgin olive oil" → "olive oil"
   ✓ "kosher salt" → "salt"
   ✓ "all-purpose flour" → "all-purpose flour" (keep type for baking items)

8. **Compound Ingredients**: For "X and Y", create ONE canonical name if it's a common pairing (e.g., "salt and pepper"), otherwise split into separate matches.

9. **Categories**: Assign ONE category from ONLY these options:
   - produce, dairy, meat & seafood, pantry staples, frozen, beverages, snacks, condiments, baking

10. **Confidence Scoring**:
    - 0.9-1.0: Exact match to existing canonical ingredient
    - 0.7-0.9: Close match with minor normalization
    - 0.5-0.7: New canonical name but clear ingredient
    - 0.3-0.5: Ambiguous or unclear ingredient
    - 0.0-0.3: Very uncertain or invalid input

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code blocks) as an array:
[{"id":"input-id","originalName":"original input","canonicalName":"canonical","category":"category","confidence":0.92}]

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

  const aiProvider: "Gemini" | "OpenAI" = hasGemini ? "Gemini" : "OpenAI"
  const requestFn = hasGemini ? callGemini : callOpenAI

  try {
    const canonicalList = await fetchCanonicalIngredients()
    const prompt = buildPrompt(inputs, canonicalList, context)
    const content = await withTimeout(requestFn(prompt), 20000)

    if (!content) {
      console.warn(`[IngredientStandardizer] ${aiProvider} returned empty content`)
      return fallbackResults(inputs)
    }

    const cleaned = content.replace(/```json|```/gi, "").trim()
    const parsed = JSON.parse(cleaned)

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
    console.error(`[IngredientStandardizer] Failed to call ${aiProvider}:`, error)
    return fallbackResults(inputs)
  }
}
