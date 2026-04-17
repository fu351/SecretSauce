import { standardizedIngredientsDB } from "../../../../lib/database/standardized-ingredients-db"
import { normalizeCanonicalName } from "../../../scripts/utils/canonical-matching"
import { toCanonicalTokens } from "./tokens"
import type { CanonicalTokenIdfScorer } from "./token-idf"

export const INVALID_CANONICAL_NAMES = new Set([
  "other",
  "unknown",
  "none",
  "null",
  "n/a",
  "na",
  "misc",
  "miscellaneous",
  // Too generic — use specific variants (turkey deli meat, roast beef deli meat, etc.)
  "deli meat",
])

const NEW_CANONICAL_DYNAMIC_TOKEN_BASE_MIN_CONFIDENCE = 0.55
const NEW_CANONICAL_DYNAMIC_TOKEN_CONFIDENCE_STEP = 0.1
const NEW_CANONICAL_LONG_NAME_MIN_CONFIDENCE = 0.8
const NEW_CANONICAL_MAX_TOKEN_COUNT = 4
const NEW_CANONICAL_RETAIL_TITLE_TOKEN_COUNT = 5
export const NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES = 2
export const NEW_CANONICAL_PROBATION_STALE_DAYS = 14
const NEW_CANONICAL_NOISE_TOKENS = new Set([
  "fresh",
  "deli",
  "sliced",
  "slice",
  "grab",
  "go",
  "classic",
  "premium",
  "original",
  "family",
  "pack",
  "tray",
  "kosher",
  "grade",
  "large",
  "jumbo",
  "natural",
  "cage",
  "free",
  "low",
  "fat",
  "part",
  "skim",
  "blend",
  "style",
  "collection",
  "flavor",
  "flavored",
  "nouveau",
  "table",
])

const RETAIL_SUFFIX_TOKENS = new Set([
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "g",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
  "ml",
  "milliliter",
  "milliliters",
  "l",
  "liter",
  "liters",
  "litre",
  "litres",
  "ltr",
  "qt",
  "quart",
  "quarts",
  "pt",
  "pint",
  "pints",
  "gal",
  "gallon",
  "gallons",
  "fl",
  "floz",
  "ct",
  "count",
  "counts",
  "pk",
  "pkg",
  "pack",
  "packs",
  "package",
  "packages",
  "bottle",
  "bottles",
  "bag",
  "bags",
  "box",
  "boxes",
  "can",
  "cans",
  "jar",
  "jars",
  "carton",
  "cartons",
  "tray",
  "trays",
  "case",
  "cases",
  "pouch",
  "pouches",
  "unit",
  "units",
  "each",
  "ea",
  "piece",
  "pieces",
])

function isRetailQuantityToken(token: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(token)
}

function isCompactRetailMeasurementToken(token: string): boolean {
  return (
    /^\d+(?:\.\d+)?(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters|litre|litres|ltr|qt|quart|quarts|pt|pint|pints|gal|gallon|gallons|ct|count|counts|pk|pkg|pack|packs)$/i.test(
      token
    ) ||
    /^(?:oz|lb|lbs|g|kg|ml|l|ltr|qt|pt|gal)\d+(?:\.\d+)?$/i.test(token)
  )
}

function stripRetailSuffixTokens(tokens: string[]): string[] {
  let end = tokens.length

  while (end > 0) {
    const token = tokens[end - 1]
    const previous = end > 1 ? tokens[end - 2] : null

    if (isCompactRetailMeasurementToken(token) || RETAIL_SUFFIX_TOKENS.has(token)) {
      end -= 1
      if (previous && isRetailQuantityToken(previous)) {
        end -= 1
      }
      continue
    }

    if (isRetailQuantityToken(token)) {
      end -= 1
      continue
    }

    break
  }

  return tokens.slice(0, end)
}

export function isInvalidCanonicalName(canonicalName: string): boolean {
  const normalized = normalizeCanonicalName(canonicalName)
  return !normalized || INVALID_CANONICAL_NAMES.has(normalized)
}

export function stripRetailSuffixTokensFromCanonicalName(canonicalName: string): string | null {
  const normalized = normalizeCanonicalName(canonicalName)
  if (!normalized) return null

  const tokens = toCanonicalTokens(normalized)
  const stripped = stripRetailSuffixTokens(tokens)
  if (!stripped.length || stripped.length === tokens.length) return null

  const result = stripped.join(" ")
  return isInvalidCanonicalName(result) ? null : result
}

function buildBlockedCanonicalFallbackCandidates(canonicalName: string): Array<{ canonicalName: string; source: string }> {
  const candidates: Array<{ canonicalName: string; source: string }> = []
  const seen = new Set<string>()
  const baseCanonical = normalizeCanonicalName(canonicalName)

  const addCandidate = (value: string | null | undefined, source: string): void => {
    const normalized = normalizeCanonicalName(value || "")
    if (!normalized || normalized === baseCanonical || seen.has(normalized)) return
    if (INVALID_CANONICAL_NAMES.has(normalized)) return
    seen.add(normalized)
    candidates.push({ canonicalName: normalized, source })
  }

  const baseTokens = toCanonicalTokens(baseCanonical)
  const strippedRetailTokens = stripRetailSuffixTokens(baseTokens)

  if (strippedRetailTokens.length > 0 && strippedRetailTokens.length < baseTokens.length) {
    addCandidate(strippedRetailTokens.join(" "), "strip_retail_suffix")

    if (strippedRetailTokens.length >= 2) {
      addCandidate(
        strippedRetailTokens.slice(-2).join(" "),
        "strip_retail_suffix_tail_2_tokens"
      )
    }
    addCandidate(
      strippedRetailTokens.slice(-1).join(" "),
      "strip_retail_suffix_tail_1_token"
    )
  }

  if (baseTokens.length >= 2) {
    addCandidate(baseTokens.slice(-2).join(" "), "tail_2_tokens")
  }
  if (baseTokens.length >= 3) {
    addCandidate(baseTokens.slice(-3).join(" "), "tail_3_tokens")
  }

  return candidates
}

function getDynamicTokenConfidenceFloor(tokenCount: number): number {
  if (tokenCount <= 2) return 0

  const growthSteps = Math.max(0, tokenCount - 3)
  const dynamicFloor =
    NEW_CANONICAL_DYNAMIC_TOKEN_BASE_MIN_CONFIDENCE + growthSteps * NEW_CANONICAL_DYNAMIC_TOKEN_CONFIDENCE_STEP

  return Math.min(dynamicFloor, NEW_CANONICAL_LONG_NAME_MIN_CONFIDENCE)
}

export function assessNewCanonicalRisk(params: {
  canonicalName: string
  category: string | null | undefined
  confidence: number
  tokenIdfScorer?: CanonicalTokenIdfScorer
}): { blocked: boolean; reason: string } {
  const { canonicalName, category, confidence, tokenIdfScorer } = params
  const normalized = normalizeCanonicalName(canonicalName)
  const tokens = toCanonicalTokens(normalized)
  const tokenCount = tokens.length
  const hasNumericToken = /\b\d+[a-z]*\b/.test(normalized)
  const noiseHits = tokens.filter((token) => NEW_CANONICAL_NOISE_TOKENS.has(token)).length
  const categoryUnknown = !category || category === "other"

  // Use IDF-based floor when the vocabulary is ready; fall back to token-count floor.
  const idfFloor = tokenIdfScorer?.getFloor(canonicalName) ?? -1
  const minTokenConfidence = idfFloor >= 0 ? idfFloor : getDynamicTokenConfidenceFloor(tokenCount)
  const floorLabel = idfFloor >= 0 ? "idf_token_floor" : "dynamic_token_confidence_floor"

  if (minTokenConfidence > 0 && confidence < minTokenConfidence) {
    // Bypass when the LLM returned a specific (non-"other") category with adequate
    // confidence — specialty/foreign ingredients have novel tokens but are real food.
    // Fall through rather than returning early so structural checks (retail_title_like
    // etc.) still run — a known-category name can still be a product title.
    const categoryBypass = !categoryUnknown && confidence >= 0.4
    if (!categoryBypass) {
      return {
        blocked: true,
        reason:
          `${floorLabel}(min_confidence=${minTokenConfidence.toFixed(2)}, ` +
          `tokens=${tokenCount})`,
      }
    }
  }

  if (
    tokenCount >= NEW_CANONICAL_RETAIL_TITLE_TOKEN_COUNT &&
    (hasNumericToken || noiseHits >= 1 || categoryUnknown)
  ) {
    return {
      blocked: true,
      reason: `retail_title_like(tokens=${tokenCount}, noise_hits=${noiseHits}, has_numeric=${hasNumericToken})`,
    }
  }

  if (tokenCount >= 4 && noiseHits >= 2) {
    return {
      blocked: true,
      reason: `high_noise_density(tokens=${tokenCount}, noise_hits=${noiseHits})`,
    }
  }

  if (categoryUnknown && tokenCount > NEW_CANONICAL_MAX_TOKEN_COUNT) {
    return {
      blocked: true,
      reason: `unknown_category_long_name(max_tokens=${NEW_CANONICAL_MAX_TOKEN_COUNT}, tokens=${tokenCount})`,
    }
  }

  return { blocked: false, reason: "ok" }
}

export async function resolveBlockedNewCanonicalFallback(params: {
  canonicalName: string
  category: string | null | undefined
  confidence: number
  tokenIdfScorer?: CanonicalTokenIdfScorer
}): Promise<{ canonicalName: string; category: string | null; source: string } | null> {
  const candidates = buildBlockedCanonicalFallbackCandidates(params.canonicalName)
  const derivedCandidates = candidates.filter((candidate) => candidate.source.startsWith("strip_retail_suffix"))

  for (const candidate of candidates) {
    const existing = await standardizedIngredientsDB.findByCanonicalName(candidate.canonicalName)
    if (!existing?.canonical_name) continue
    return {
      canonicalName: existing.canonical_name,
      category: existing.category ?? null,
      source: candidate.source,
    }
  }

  for (const candidate of derivedCandidates) {
    const risk = assessNewCanonicalRisk({
      canonicalName: candidate.canonicalName,
      category: params.category,
      confidence: params.confidence,
      tokenIdfScorer: params.tokenIdfScorer,
    })
    if (risk.blocked) continue

    return {
      canonicalName: candidate.canonicalName,
      category: params.category ?? null,
      source: `derived_${candidate.source}`,
    }
  }

  return null
}
