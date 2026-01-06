import axios from "axios"
import { createServerClient } from "./supabase"
import { normalizeCanonicalName } from "./ingredient-utils"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

interface IngredientInput {
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

/**
 * Find relevant canonical ingredient candidates using full-text search.
 * This is more targeted than fetching random samples.
 */
async function findRelevantCandidates(searchTerm: string, limit = 20): Promise<{ id: string; canonical_name: string; category: string | null }[]> {
  try {
    const client = createServerClient()
    const normalizedSearch = normalizeCanonicalName(searchTerm)

    // Split into words for better full-text matching
    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 2)

    if (searchWords.length === 0) {
      return []
    }

    // Use Postgres full-text search with the search_vector column
    const tsQuery = searchWords.join(" | ") // OR search
    const { data, error } = await client
      .from("standardized_ingredients")
      .select("id, canonical_name, category")
      .textSearch("search_vector", tsQuery, { type: "websearch" })
      .limit(limit)

    if (error) {
      console.warn("[IngredientStandardizer] Full-text search failed, falling back to ilike:", error.message)
      // Fallback to ilike search
      const { data: ilikeData, error: ilikeError } = await client
        .from("standardized_ingredients")
        .select("id, canonical_name, category")
        .ilike("canonical_name", `%${searchWords[0]}%`)
        .limit(limit)

      if (ilikeError || !ilikeData) {
        return []
      }
      return ilikeData
    }

    return data || []
  } catch (error) {
    console.warn("[IngredientStandardizer] Error finding candidates:", error)
    return []
  }
}

export interface SemanticMatchResult {
  matchedId: string | null       // ID of matched existing ingredient, or null if new
  canonicalName: string          // The canonical name (existing or new)
  category: string | null        // Category
  confidence: number             // 0-1 confidence score
  isNewIngredient: boolean       // True if this is a new ingredient not in DB
}

/**
 * Use AI to semantically match an ingredient to existing canonical names.
 * Returns the best match or suggests creating a new ingredient.
 */
export async function findSemanticMatch(
  ingredientName: string,
  context: "recipe" | "pantry" = "recipe"
): Promise<SemanticMatchResult> {
  const normalizedInput = normalizeCanonicalName(ingredientName)

  if (!normalizedInput) {
    return {
      matchedId: null,
      canonicalName: ingredientName.toLowerCase().trim(),
      category: null,
      confidence: 0.1,
      isNewIngredient: true,
    }
  }

  // Find relevant candidates using full-text search
  const candidates = await findRelevantCandidates(ingredientName, 30)

  console.log("[IngredientStandardizer] Semantic match candidates", {
    input: ingredientName,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 5).map(c => c.canonical_name),
  })

  // If we have an exact normalized match, return it immediately
  const exactMatch = candidates.find(c => normalizeCanonicalName(c.canonical_name) === normalizedInput)
  if (exactMatch) {
    console.log("[IngredientStandardizer] Found exact normalized match", { input: ingredientName, match: exactMatch.canonical_name })
    return {
      matchedId: exactMatch.id,
      canonicalName: exactMatch.canonical_name,
      category: exactMatch.category,
      confidence: 1.0,
      isNewIngredient: false,
    }
  }

  // No candidates found - will need to create new
  if (candidates.length === 0) {
    // Use AI to get a good canonical name
    const aiResult = await standardizeIngredientsWithAI([{ id: "0", name: ingredientName }], context)
    const aiSuggestion = aiResult[0]

    return {
      matchedId: null,
      canonicalName: aiSuggestion?.canonicalName || normalizedInput,
      category: aiSuggestion?.category || null,
      confidence: 0.5,
      isNewIngredient: true,
    }
  }

  // Use AI to pick the best semantic match from candidates
  if (!OPENAI_API_KEY) {
    // No API key - use simple heuristic matching
    const bestCandidate = candidates[0]
    return {
      matchedId: bestCandidate.id,
      canonicalName: bestCandidate.canonical_name,
      category: bestCandidate.category,
      confidence: 0.6,
      isNewIngredient: false,
    }
  }

  try {
    const candidateList = candidates.map(c => ({ id: c.id, name: c.canonical_name, category: c.category }))

    const prompt = `You are matching a ${context} ingredient to existing canonical grocery ingredients.

INPUT INGREDIENT: "${ingredientName}"

EXISTING CANONICAL INGREDIENTS (pick the BEST semantic match, or indicate NONE if no good match):
${JSON.stringify(candidateList, null, 2)}

Instructions:
1. Find the BEST semantic match considering:
   - Synonyms: "scallions" = "green onions", "cilantro" = "coriander leaves"
   - Singular/plural: "chicken breast" = "chicken breasts"
   - Common variations: "parmesan" = "parmigiano reggiano", "bell pepper" = "capsicum"
   - Brand-agnostic: "Sriracha sauce" → "sriracha" or "hot sauce"

2. If a good match exists, return its ID. If no good match (ingredient is truly new), return null.

3. Strip preparation methods: "diced tomatoes" should match "tomatoes", not be a new ingredient.

4. Return ONLY valid JSON (no markdown):
{"matchedId": "uuid-or-null", "canonicalName": "name", "category": "category", "confidence": 0.95, "isNewIngredient": false}

If creating new: {"matchedId": null, "canonicalName": "suggested name", "category": "category", "confidence": 0.8, "isNewIngredient": true}`

    const response = await withTimeout(
      axios.post(
        OPENAI_URL,
        {
          model: "gpt-4o-mini",
          temperature: 0.1,
          max_tokens: 200,
          messages: [
            { role: "system", content: "You match ingredients to canonical names and return valid JSON only." },
            { role: "user", content: prompt },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      ),
      15000,
    )

    const content = response.data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error("Empty response from AI")
    }

    const cleaned = content.replace(/```json|```/gi, "").trim()
    const result = JSON.parse(cleaned)

    console.log("[IngredientStandardizer] AI semantic match result", {
      input: ingredientName,
      matchedId: result.matchedId,
      canonicalName: result.canonicalName,
      confidence: result.confidence,
      isNewIngredient: result.isNewIngredient,
    })

    // Validate the matched ID exists in our candidates
    if (result.matchedId && !result.isNewIngredient) {
      const matchedCandidate = candidates.find(c => c.id === result.matchedId)
      if (matchedCandidate) {
        return {
          matchedId: matchedCandidate.id,
          canonicalName: matchedCandidate.canonical_name,
          category: matchedCandidate.category,
          confidence: typeof result.confidence === "number" ? result.confidence : 0.8,
          isNewIngredient: false,
        }
      }
    }

    // AI suggested new ingredient or invalid match
    return {
      matchedId: null,
      canonicalName: normalizeCanonicalName(result.canonicalName || ingredientName),
      category: result.category || null,
      confidence: typeof result.confidence === "number" ? result.confidence : 0.7,
      isNewIngredient: true,
    }
  } catch (error) {
    console.warn("[IngredientStandardizer] AI semantic match failed:", error)
    // Fallback to first candidate
    const bestCandidate = candidates[0]
    return {
      matchedId: bestCandidate.id,
      canonicalName: bestCandidate.canonical_name,
      category: bestCandidate.category,
      confidence: 0.5,
      isNewIngredient: false,
    }
  }
}

function buildPrompt(inputs: IngredientInput[], canonicalNames: string[], context: "recipe" | "pantry") {
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
    canonicalName: normalizeCanonicalName(item.name),
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
        // Use normalizeCanonicalName to ensure consistent format (handles hyphens, spaces, case)
        const canonicalName =
          typeof item.canonicalName === "string" && item.canonicalName.trim().length > 0
            ? normalizeCanonicalName(item.canonicalName)
            : normalizeCanonicalName(input.name)
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
