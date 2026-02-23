import { createHash } from "crypto"
import type { IngredientStandardizationResult } from "../../lib/ingredient-standardizer"
import type { IngredientStandardizerContext } from "../../lib/utils/ingredient-standardizer-context"
import { normalizeCanonicalName } from "../../scripts/utils/canonical-matching"
import { normalizeSpaces } from "../../lib/utils/string"
import { normalizeConfidence } from "../../lib/utils/number"

export const INGREDIENT_LOCAL_CACHE_VERSION = "ingredient-standardizer-v2"
export const INGREDIENT_LOCAL_CACHE_MAX_AGE_DAYS = 30
const MIN_CACHEABLE_INGREDIENT_CONFIDENCE = 0.65
const TRAILING_NUMERIC_TOKEN_PATTERN = /\b\d+(?:\.\d+)?$/

export type IngredientLocalCachePayload = {
  canonicalName: string
  isFoodItem: boolean
  category: string | null
  confidence: number
}

function toStableHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function buildIngredientLocalCacheKey(context: IngredientStandardizerContext, searchTerm: string): string {
  return toStableHash({
    context,
    searchTerm: normalizeSpaces(searchTerm.toLowerCase()),
  })
}

export function toIngredientLocalCachePayload(
  result: IngredientStandardizationResult
): IngredientLocalCachePayload | null {
  const canonicalName = normalizeCanonicalName(result.canonicalName || "")
  if (!canonicalName) return null
  if (TRAILING_NUMERIC_TOKEN_PATTERN.test(canonicalName)) return null

  const confidence = normalizeConfidence(result.confidence, 0.5)
  if (confidence < MIN_CACHEABLE_INGREDIENT_CONFIDENCE) return null

  return {
    canonicalName,
    isFoodItem: result.isFoodItem !== false,
    category: result.category?.trim() || null,
    confidence,
  }
}

export function fromIngredientLocalCachePayload(
  payload: unknown,
  id: string,
  originalName: string
): IngredientStandardizationResult | null {
  const canonicalName = normalizeCanonicalName((payload as IngredientLocalCachePayload)?.canonicalName || "")
  if (!canonicalName) return null
  if (TRAILING_NUMERIC_TOKEN_PATTERN.test(canonicalName)) return null

  const confidence = normalizeConfidence((payload as IngredientLocalCachePayload)?.confidence, 0.5)
  if (confidence < MIN_CACHEABLE_INGREDIENT_CONFIDENCE) return null

  const categoryRaw = (payload as IngredientLocalCachePayload)?.category
  const isFoodItemRaw = (payload as IngredientLocalCachePayload)?.isFoodItem
  const isFoodItem = typeof isFoodItemRaw === "boolean" ? isFoodItemRaw : true
  const category =
    isFoodItem && typeof categoryRaw === "string" && categoryRaw.trim().length > 0
      ? categoryRaw.trim().toLowerCase()
      : null

  return {
    id,
    originalName,
    canonicalName,
    isFoodItem,
    category,
    confidence,
  }
}
