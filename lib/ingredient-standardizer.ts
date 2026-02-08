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

  const contextGuidance = context === "recipe" 
    ? `**RECIPE CONTEXT**: Ingredients should be RAW, BASIC food items only.
- REJECT packaged meal kits, pre-seasoned mixes, branded convenience foods
- If you see "Helper", "Mix", "Kit", "Meal Kit", "Sides" → LOW confidence (0.40-0.50)
- Strip to base ingredient: "Hamburger Helper Beef Stroganoff" → "pasta"
- These indicate bad recipe data and should be flagged for manual review in ingredient_match_queue`
    : `**PANTRY CONTEXT**: Users may have purchased convenience products.
- Packaged meal kits, rice sides, flavored pouches are ACCEPTABLE
- Keep reasonable specificity: "Hamburger Helper Beef Stroganoff" → "beef stroganoff pasta kit"
- Normal confidence for these: 0.65-0.75`

  return `
You are an expert ingredient normalizer for a grocery price comparison system. Your job is to map ingredient names to canonical forms that enable accurate price tracking across stores and recipes.

**DATABASE CONTEXT:**
- You're standardizing to match entries in the 'standardized_ingredients' table
- Each canonical ingredient has: id, canonical_name, category, default_unit, estimated_unit_weight_oz
- The system uses these standardized names to compare prices across stores and calculate shopping lists
- Your output feeds into price comparison algorithms and shopping list generation

**CURRENT CONTEXT: ${context.toUpperCase()}**
${contextGuidance}

**EXISTING CANONICAL INGREDIENTS (${canonicalNames.length} total):**
${canonicalList}

═══════════════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════════════

**1. FOOD vs NON-FOOD:**
   ${context === "recipe" 
     ? "- ONLY process FOOD items meant for human consumption\n   - Recipes should NEVER contain household supplies"
     : "- PRIMARILY process FOOD items\n   - Pantry may include household supplies (paper towels, soap) but score them LOW"
   }
   
   ❌ REJECT (confidence 0.0-0.2, category: null):
   - Household: paper towels, foil, plastic wrap, trash bags, cleaning supplies
   - Personal care: soap, shampoo, toothpaste, medicine, vitamins
   - Pet supplies: dog food, cat litter, pet treats
   - Kitchen items: pans, utensils, containers
   - Other: batteries, light bulbs, gift cards

   ✓ ACCEPT: All foods, beverages, spices, condiments for human consumption

**2. MATCH EXISTING FIRST:**
   - ALWAYS prioritize exact or close matches to the canonical list above
   - "yellow onion" → "onion" (if "onion" exists in canonical list)
   - "sharp cheddar" → "cheddar cheese" (if exists)
   - Only create NEW canonical names when no reasonable match exists

**3. NORMALIZATION RULES:**
   
   a) **Strip Preparation Methods:**
      - Remove: chopped, minced, diced, sliced, grated, shredded, crushed
      - Remove: cooked, raw, steamed, boiled, roasted, grilled, fried
      - Example: "chopped yellow onion" → "onion"
   
   b) **Strip Non-Essential Qualifiers:**
      - Size: large, small, medium, jumbo
      - Quality: fresh, organic, premium, extra, fancy, free-range
      - Freshness: ripe, unripe, day-old
      - Optional: to taste, optional, divided, if needed, as needed
      - Marketing: deluxe, gourmet, artisan, homestyle, restaurant-style
      - Example: "large organic roma tomatoes" → "tomato"
   
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
      - "Kraft cheddar cheese" → "cheddar cheese"
      - "Heinz ketchup" → "ketchup"
      - "Campbell's tomato soup" → "tomato soup"
      - "Philadelphia cream cheese" → "cream cheese"
   
   e) **Singular Form:**
      - "tomatoes" → "tomato"
      - "apples" → "apple"
      - "eggs" → "egg"
      - Exception: Items typically plural ("green beans", "black beans", "rice noodles")
   
   f) **Lowercase Everything:**
      - All canonical names must be lowercase

**4. PACKAGED CONVENIENCE FOODS & MEAL KITS:**

   ${context === "recipe" ? `
   ⚠️ **RECIPE CONTEXT - These are RED FLAGS:**
   
   Packaged meal kits RARELY belong in real recipes. If you encounter:
   - "[Brand] Helper" (Hamburger Helper, Tuna Helper)
   - "[Brand] Sides" (Rice-A-Roni, Pasta Roni, Knorr Rice Sides)
   - "[Anything] Meal Kit"
   - "[Anything] Mix" (unless it's a dry ingredient like "flour mix")
   - Pre-seasoned pouches (flavored tuna, rice pouches)
   
   **Handle as follows:**
   - Confidence: 0.40-0.50 (flags for ingredient_match_queue review)
   - Strip to BASE ingredient only:
     * "Hamburger Helper Beef Stroganoff" → "pasta"
     * "Rice-A-Roni Chicken Flavor" → "rice"
     * "StarKist Herb & Garlic Tuna Pouch" → "tuna"
     * "Betty Crocker Brownie Mix" → "brownie mix" (OK - this is a baking mix)
   - These likely indicate bad recipe scraping or user error
   
   **Examples:**
   
   ❓ "1 box Hamburger Helper Deluxe Beef Stroganoff Pasta Meal Kit"
     → canonicalName: "pasta"
     → category: "pantry_staples"
     → confidence: 0.45
     → ⚠️ Low confidence will flag for manual review
   
   ❓ "90 Second Long Grain & Wild Rice with Herbs Microwavable Pouch"
     → canonicalName: "rice"
     → category: "pantry_staples"
     → confidence: 0.45
   
   ❓ "StarKist Tuna Creations Herb & Garlic Pouch"
     → canonicalName: "tuna"
     → category: "pantry_staples"
     → confidence: 0.48
   
   ✓ "Betty Crocker Brownie Mix" (baking mixes ARE legitimate)
     → canonicalName: "brownie mix"
     → category: "baking"
     → confidence: 0.75
   ` : `
   ✓ **PANTRY CONTEXT - These are ACCEPTABLE:**
   
   Users DO purchase convenience foods. Handle with normal confidence:
   
   **Rules:**
   1. Remove brand names (always)
   2. Keep product type + key flavor/ingredient
   3. Remove marketing language (Deluxe, Creations, 90 Second, etc.)
   4. Confidence: 0.65-0.75 (normal for packaged foods)
   
   **Examples:**
   
   ✓ "Hamburger Helper Deluxe Beef Stroganoff Pasta Meal Kit - 5.5oz"
     → canonicalName: "beef stroganoff pasta kit"
     → category: "pantry_staples"
     → confidence: 0.70
   
   ✓ "90 Second Long Grain & Wild Rice with Herbs & Seasonings Pouch"
     → canonicalName: "wild rice mix"
     → category: "pantry_staples"
     → confidence: 0.72
   
   ✓ "StarKist Tuna Creations Herb & Garlic Pouch - 2.6oz"
     → canonicalName: "herb garlic tuna"
     → category: "pantry_staples"
     → confidence: 0.68
   
   ✓ "Knorr Rice Sides Chicken Flavor - 5.7oz"
     → canonicalName: "chicken rice side"
     → category: "pantry_staples"
     → confidence: 0.70
   
   ✓ "Campbell's Condensed Tomato Soup - 10.75oz"
     → canonicalName: "tomato soup"
     → category: "pantry_staples"
     → confidence: 0.85
   `}

**5. CATEGORY ASSIGNMENT** (use EXACT enum values):
   - **produce**: fruits, vegetables, fresh herbs
   - **dairy**: milk, cheese, yogurt, butter, eggs, cream
   - **meat_seafood**: all meats, poultry, fish, seafood
   - **pantry_staples**: flour, sugar, salt, oil, rice, pasta, beans, canned goods, grains
   - **beverages**: drinks, juice, soda, coffee, tea (NOT milk/cream - those are dairy)
   - **snacks**: chips, crackers, cookies, candy, nuts (unopened packaged snacks)
   - **condiments**: sauces, dressings, ketchup, mustard, mayo, vinegar, soy sauce
   - **baking**: baking powder, baking soda, vanilla extract, chocolate chips, yeast
   - **other**: items that don't fit above categories
   
   For NON-FOOD items: category = null

**6. CONFIDENCE SCORING:**
   - **0.95-1.0**: Exact match to existing canonical ingredient
   - **0.85-0.94**: Close match with minor normalization (e.g., "organic basil" → "basil")
   - **0.70-0.84**: Good match but required significant cleanup (e.g., "Kraft sharp cheddar" → "cheddar cheese")
   - **0.50-0.69**: New canonical name, clearly a food ingredient, no existing match
   - **0.40-0.49**: ${context === "recipe" ? "Convenience food in recipe (red flag)" : "Ambiguous ingredient"} - goes to ingredient_match_queue
   - **0.30-0.39**: Ambiguous or unclear ingredient - needs human review
   - **0.00-0.29**: Non-food item or invalid input (REJECT, category: null)

═══════════════════════════════════════════════════════════════
EXAMPLES OF PROPER NORMALIZATION:
═══════════════════════════════════════════════════════════════

**Standard Ingredient Normalization:**

✓ "2 large organic yellow onions, chopped" 
  → canonicalName: "onion"
  → category: "produce"
  → confidence: 0.92

✓ "grated parmesan cheese, divided" 
  → canonicalName: "parmesan cheese"
  → category: "dairy"
  → confidence: 0.88

✓ "boneless skinless chicken breast" 
  → canonicalName: "chicken breast"
  → category: "meat_seafood"
  → confidence: 0.90

✓ "1 lb fresh basil leaves" 
  → canonicalName: "basil"
  → category: "produce"
  → confidence: 0.95

✓ "Kraft extra sharp cheddar cheese" 
  → canonicalName: "cheddar cheese"
  → category: "dairy"
  → confidence: 0.85

✓ "all-purpose flour" 
  → canonicalName: "all-purpose flour"
  → category: "baking"
  → confidence: 0.98

✓ "extra virgin olive oil, divided" 
  → canonicalName: "olive oil"
  → category: "pantry_staples"
  → confidence: 0.92

✓ "kosher salt to taste" 
  → canonicalName: "salt"
  → category: "pantry_staples"
  → confidence: 0.98

**Non-Food Items (ALL contexts):**

❌ "Bounty paper towels" 
  → canonicalName: "paper towel"
  → category: null
  → confidence: 0.0

❌ "Dawn dish soap" 
  → canonicalName: "dish soap"
  → category: null
  → confidence: 0.0

❌ "Charmin toilet paper" 
  → canonicalName: "toilet paper"
  → category: null
  → confidence: 0.0

═══════════════════════════════════════════════════════════════
HANDLING EDGE CASES:
═══════════════════════════════════════════════════════════════

**1. Ambiguous Items (keep distinctions):**
   - "butter" vs "peanut butter" vs "almond butter" → Keep all separate
   - "cream" vs "heavy cream" vs "sour cream" vs "cream cheese" → Keep all separate
   - "milk" vs "almond milk" vs "coconut milk" → Keep all separate

**2. Compound Items:**
   - "salt and pepper" → Return TWO separate items with id suffixes:
     * id: "123-1", canonicalName: "salt"
     * id: "123-2", canonicalName: "pepper"
   - "lettuce and tomato" → TWO items: "lettuce" and "tomato"
   - Common pairings that ARE one product: "peanut butter", "cream cheese", "soy sauce"

**3. Unknown Food Items:**
   - If you don't recognize it but it SEEMS like food: confidence 0.5-0.7
   - Clean it up (lowercase, singular, remove brands) and let human review
   - DON'T invent fake categories - use "other" if unsure

**4. Abbreviations:**
   - "evoo" → "olive oil"
   - "pb" → "peanut butter"
   - "ap flour" → "all-purpose flour"
   - "xvoo" → "extra virgin olive oil" → "olive oil"

**5. Canned/Packaged Versions of Fresh Items:**
   - "canned tomatoes" → "tomato" (the form doesn't matter for price comparison)
   - "frozen peas" → "peas"
   - "canned tuna" → "tuna"
   - Exception: If the preserved form is significantly different: "sun-dried tomato"

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks, no preamble) as an array:

[
  {
    "id": "input-id",
    "originalName": "original input text",
    "canonicalName": "cleaned canonical name",
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
    "category": "pantry_staples",
    "confidence": 0.95
  },
  {
    "id": "123-2",
    "originalName": "salt and pepper",
    "canonicalName": "pepper",
    "category": "pantry_staples",
    "confidence": 0.95
  }
]

**For non-food items**, still return them with category: null and confidence near 0:
[
  {
    "id": "456",
    "originalName": "paper towels",
    "canonicalName": "paper towel",
    "category": null,
    "confidence": 0.0
  }
]

═══════════════════════════════════════════════════════════════
INPUTS TO PROCESS (Context: ${context}):
═══════════════════════════════════════════════════════════════

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
