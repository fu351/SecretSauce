import { normalizeCanonicalName, singularizeCanonicalName } from "../../scripts/utils/canonical-matching"
import type { IngredientStandardizerContext } from "./ingredient-standardizer"
import type { IngredientStandardizationInput, IngredientStandardizationResult } from "./ingredient-standardizer"
import { hasNonFoodTitleSignals } from "../shared/non-food-signals"
import { cleanRecipeIngredientName } from "../shared/ingredient-cleaning"

const PROTECTED_FORM_TOKENS = new Set([
  "seed",
  "seeds",
  "skin",
  "skins",
  "peel",
  "peels",
  "rind",
  "rinds",
  "husk",
  "husks",
  "leaf",
  "leaves",
  "stem",
  "stems",
  "pod",
  "pods",
  "bud",
  "buds",
  "flower",
  "flowers",
  "floret",
  "florets",
  "roll",
  "rolls",
  "soup",
  "stew",
  "chowder",
  "salad",
  "bowl",
  "frittata",
  "ravioli",
  "macaron",
  "macarons",
  "dressing",
  "dip",
  "sandwich",
  "wrap",
  "taco",
  "burrito",
  "pizza",
  "pasta",
  "curry",
  "risotto",
  "quiche",
  "casserole",
  "lasagna",
  "pie",
  "cake",
  "muffin",
  "cookie",
  "cookies",
  "croissant",
  "bagel",
  "noodle",
  "noodles",
  "dumpling",
  "dumplings",
  "gnocchi",
  "omelet",
  "omelette",
  "fillet",
  "filet",
  "chicken",
  "beef",
  "turkey",
  "pork",
  "lamb",
  "veal",
  "salmon",
  "tuna",
  "shrimp",
  "fish",
  "ham",
  "bacon",
  "sausage",
  "steak",
  "rib",
  "ribs",
  "duck",
  "tofu",
  "tempeh",
])

function applyFormTokenGuard(sourceCanonical: string, candidateCanonical: string): string {
  const source = normalizeCanonicalName(sourceCanonical)
  const candidate = normalizeCanonicalName(candidateCanonical)

  if (!source || !candidate || source === candidate) {
    return candidate || source
  }

  const sourceTokens = source.split(" ").filter(Boolean)
  const candidateTokens = candidate.split(" ").filter(Boolean)
  if (!sourceTokens.length || !candidateTokens.length) {
    return candidate || source
  }

  const sourceFormTokens = sourceTokens.filter((token) => PROTECTED_FORM_TOKENS.has(token))
  if (!sourceFormTokens.length) {
    return candidate
  }

  const missingFormTokens = sourceFormTokens.filter((token) => !candidateTokens.includes(token))
  if (!missingFormTokens.length) {
    return candidate
  }

  // If the source is only a small step larger than the candidate, keep the
  // cleaned source so protected forms like "tomato seeds" stay intact.
  if (sourceTokens.length <= candidateTokens.length + 2) {
    return source
  }

  return normalizeCanonicalName([candidate, ...missingFormTokens].join(" "))
}

function inferCategory(canonicalName: string): string | null {
  const normalized = normalizeCanonicalName(canonicalName)
  if (!normalized) return null

  const tokens = new Set(normalized.split(" ").filter(Boolean))
  const hasAny = (...candidates: string[]) => candidates.some((candidate) => tokens.has(candidate))
  const hasPhrase = (...phrase: string[]) => phrase.every((token) => tokens.has(token))

  // Check prepared-food compound signals before raw ingredient tokens so that names
  // like "tomato soup" or "mushroom stew" match pantry_staples rather than produce.
  if (hasAny("soup", "stew", "chowder", "salad", "bowl", "ravioli", "pasta", "noodle", "noodles", "macaron", "macarons", "roll", "rolls", "sandwich", "wrap", "taco", "burrito", "pizza")) {
    return "pantry_staples"
  }

  // Condiments and beverages before produce for the same reason ("garlic sauce", "ginger beer").
  if (hasAny("sauce", "dressing", "ketchup", "mustard", "mayo", "mayonnaise", "vinegar", "soy") || hasPhrase("soy", "sauce")) {
    return "condiments"
  }

  if (hasAny("juice", "soda", "water", "tea", "coffee", "drink", "beverage", "wine", "beer")) {
    return "beverages"
  }

  if (hasAny("tomato", "onion", "pepper", "lettuce", "cucumber", "carrot", "potato", "spinach", "broccoli", "basil", "cilantro", "parsley", "mint", "kale", "celery", "mushroom", "garlic", "ginger", "lemon", "lime", "apple", "banana", "orange", "berry", "berries", "cherry", "grape", "seed", "seeds")) {
    return "produce"
  }

  if (hasAny("milk", "cheese", "yogurt", "butter", "cream", "egg", "eggs")) {
    return "dairy"
  }

  if (hasAny("chicken", "beef", "pork", "lamb", "veal", "salmon", "tuna", "shrimp", "fish", "ham", "bacon", "sausage", "steak", "rib", "ribs", "duck", "tofu", "tempeh")) {
    return "meat_seafood"
  }

  if (hasAny("chip", "chips", "cracker", "crackers", "cookie", "cookies", "candy", "nuts", "nut", "pretzel", "pretzels")) {
    return "snacks"
  }

  if (hasAny("flour", "powder", "soda", "yeast", "vanilla", "chocolate", "chips")) {
    return "baking"
  }

  if (hasAny("salt", "spice", "spices", "seasoning", "seasonings", "paprika", "cumin", "turmeric", "curry", "pepper", "peppercorn", "herb", "herbs")) {
    return "spices"
  }

  return "other"
}

function buildDeterministicCanonicalName(name: string): string {
  const cleaned = cleanRecipeIngredientName(name)
  const sourceCanonical = cleaned || normalizeCanonicalName(name)
  const candidateCanonical = singularizeCanonicalName(cleaned || name)
  return applyFormTokenGuard(sourceCanonical, candidateCanonical)
}

function deterministicConfidence(sourceCanonical: string, canonicalName: string, isFoodItem: boolean): number {
  if (!isFoodItem) return 0.05
  if (normalizeCanonicalName(sourceCanonical) === normalizeCanonicalName(canonicalName)) {
    return 0.92
  }

  const sourceTokens = normalizeCanonicalName(sourceCanonical).split(" ").filter(Boolean)
  const candidateTokens = normalizeCanonicalName(canonicalName).split(" ").filter(Boolean)
  const shared = sourceTokens.filter((token) => candidateTokens.includes(token))
  if (shared.length >= 2) return 0.84
  if (shared.length >= 1) return 0.78
  return 0.7
}

export function standardizeIngredientsDeterministically(
  inputs: IngredientStandardizationInput[],
  _context: IngredientStandardizerContext
): IngredientStandardizationResult[] {
  if (!inputs || inputs.length === 0) {
    return []
  }

  return inputs.map((input, index) => {
    const sourceCanonical = cleanRecipeIngredientName(input.name) || normalizeCanonicalName(input.name)
    const inferredNonFood = hasNonFoodTitleSignals(input.name)
    const canonicalName = inferredNonFood
      ? sourceCanonical
      : buildDeterministicCanonicalName(input.name) || sourceCanonical
    const category = inferredNonFood ? null : inferCategory(canonicalName)
    const confidence = deterministicConfidence(sourceCanonical, canonicalName, !inferredNonFood)

    return {
      id: String(input.id ?? index),
      originalName: input.name,
      canonicalName,
      isFoodItem: !inferredNonFood,
      category,
      confidence,
    }
  })
}
