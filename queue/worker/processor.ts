import { createHash } from "crypto"
import {
  ingredientMatchQueueDB,
  type IngredientMatchQueueRow,
  type IngredientMatchQueueUpdate,
} from "../../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../../lib/database/standardized-ingredients-db"
import { standardizeIngredientsWithAI, type IngredientStandardizationResult } from "../../lib/ingredient-standardizer"
import { standardizeUnitsWithAI, type UnitStandardizationResult } from "../../lib/unit-standardizer"
import type { QueueWorkerConfig } from "../config"
import type { IngredientStandardizerContext } from "../../lib/utils/ingredient-standardizer-context"
import { chunkItems, mapWithConcurrency } from "./batching"
import { localQueueAICache } from "./local-ai-cache"
import {
  buildCanonicalQueryTerms,
  type CanonicalCandidate,
  normalizeCanonicalName,
  scoreCanonicalSimilarity,
} from "../../scripts/utils/canonical-matching"

interface ResolveBatchResult {
  resolved: number
  failed: number
  results?: Array<{
    rowId: string
    originalName: string
    canonicalName: string
    category: string | null
    confidence: number
    resolvedUnit?: string | null
    resolvedQuantity?: number | null
    unitConfidence?: number | null
    quantityConfidence?: number | null
    status: "success" | "error"
    error?: string
  }>
}

export interface QueueRunSummary {
  cycles: number
  totalResolved: number
  totalFailed: number
  dryRunResults?: ResolveBatchResult["results"]
}

const INVALID_CANONICAL_NAMES = new Set([
  "other",
  "unknown",
  "none",
  "null",
  "n/a",
  "na",
  "misc",
  "miscellaneous",
])

const RESOLVED_UNIT_ALIASES: Record<string, string[]> = {
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  "fl oz": ["fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces"],
  ml: ["ml", "milliliter", "milliliters"],
  gal: ["gal", "gallon", "gallons"],
  ct: ["ct", "count"],
  each: ["each", "ea"],
  bunch: ["bunch"],
  gram: ["gram", "grams", "g"],
  unit: ["unit"],
}

const GENERIC_MEASURE_ALIASES = [
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "clove",
  "cloves",
  "stalk",
  "stalks",
  "sprig",
  "sprigs",
  "pinch",
  "dash",
  "glug",
  "can",
  "cans",
  "jar",
  "jars",
  "package",
  "pkg",
  "pk",
  "bottle",
  "bottles",
]

const UNIT_FALLBACK_CONFIDENCE = 0.2
const CROSS_CATEGORY_SCORE_PENALTY = 0.3
const CROSS_CATEGORY_MIN_CONFIDENCE = 0.95
const CROSS_CATEGORY_MIN_SIMILARITY_FLOOR = 0.92
const CROSS_CATEGORY_MIN_SIMILARITY_BUFFER = 0.15
const GENERIC_TO_SPECIFIC_MIN_CONFIDENCE = 0.95
const GENERIC_TO_SPECIFIC_MIN_SIMILARITY_FLOOR = 0.9
const GENERIC_TO_SPECIFIC_MIN_SIMILARITY_BUFFER = 0.2
const LATERAL_MIN_SIMILARITY_FLOOR = 0.55
const NEW_CANONICAL_MIN_CONFIDENCE = 0.65
const NEW_CANONICAL_LONG_NAME_MIN_CONFIDENCE = 0.8
const NEW_CANONICAL_MAX_TOKEN_COUNT = 4
const NEW_CANONICAL_RETAIL_TITLE_TOKEN_COUNT = 5
const INGREDIENT_LOCAL_CACHE_VERSION = "ingredient-standardizer-v1"
const INGREDIENT_LOCAL_CACHE_MAX_AGE_DAYS = 30
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

function getSearchTerm(row: IngredientMatchQueueRow): string {
  return (row.cleaned_name || row.raw_product_name || "").trim()
}

function getCanonicalFallback(row: IngredientMatchQueueRow): string {
  const fallback = row.best_fuzzy_match || row.cleaned_name || row.raw_product_name || "unknown ingredient"
  return normalizeCanonicalName(fallback) || "unknown ingredient"
}

function normalizeConfidence(value: number | null | undefined, fallback = 0.5): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return fallback
  return value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function toStableHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function buildIngredientLocalCacheKey(context: IngredientStandardizerContext, searchTerm: string): string {
  return toStableHash({
    context,
    searchTerm: normalizeSpaces(searchTerm.toLowerCase()),
  })
}

type IngredientLocalCachePayload = {
  canonicalName: string
  category: string | null
  confidence: number
}

function toIngredientLocalCachePayload(
  result: IngredientStandardizationResult
): IngredientLocalCachePayload | null {
  const canonicalName = normalizeCanonicalName(result.canonicalName || "")
  if (!canonicalName) return null

  return {
    canonicalName,
    category: result.category?.trim() || null,
    confidence: normalizeConfidence(result.confidence, 0.5),
  }
}

function fromIngredientLocalCachePayload(
  payload: unknown,
  id: string,
  originalName: string
): IngredientStandardizationResult | null {
  const canonicalName = normalizeCanonicalName((payload as IngredientLocalCachePayload)?.canonicalName || "")
  if (!canonicalName) return null

  const categoryRaw = (payload as IngredientLocalCachePayload)?.category
  const category =
    typeof categoryRaw === "string" && categoryRaw.trim().length > 0 ? categoryRaw.trim().toLowerCase() : null

  return {
    id,
    originalName,
    canonicalName,
    category,
    confidence: normalizeConfidence((payload as IngredientLocalCachePayload)?.confidence, 0.5),
  }
}

function toCanonicalTokenSet(value: string): Set<string> {
  return new Set(
    normalizeCanonicalName(value)
      .split(" ")
      .filter(Boolean)
  )
}

function toCanonicalTokens(value: string): string[] {
  return normalizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
}

function isTokenSubset(source: Set<string>, target: Set<string>): boolean {
  if (!source.size || !target.size || source.size > target.size) return false
  for (const token of source) {
    if (!target.has(token)) return false
  }
  return true
}

type RemapDirection = "generic_to_specific" | "specific_to_generic" | "lateral"

function resolveRemapDirection(sourceCanonical: string, candidateCanonical: string): RemapDirection {
  const sourceTokens = toCanonicalTokenSet(sourceCanonical)
  const candidateTokens = toCanonicalTokenSet(candidateCanonical)

  const sourceIntoCandidate = isTokenSubset(sourceTokens, candidateTokens)
  const candidateIntoSource = isTokenSubset(candidateTokens, sourceTokens)

  if (sourceIntoCandidate && candidateTokens.size > sourceTokens.size) {
    return "generic_to_specific"
  }
  if (candidateIntoSource && sourceTokens.size > candidateTokens.size) {
    return "specific_to_generic"
  }
  return "lateral"
}

function meetsAsymmetricRemapPolicy(
  direction: RemapDirection,
  confidence: number,
  similarity: number,
  config: QueueWorkerConfig
): { allowed: boolean; minConfidence: number; minSimilarity: number } {
  if (direction === "generic_to_specific") {
    const minConfidence = Math.max(config.doubleCheckMinConfidence, GENERIC_TO_SPECIFIC_MIN_CONFIDENCE)
    const minSimilarity = Math.max(
      config.doubleCheckMinSimilarity + GENERIC_TO_SPECIFIC_MIN_SIMILARITY_BUFFER,
      GENERIC_TO_SPECIFIC_MIN_SIMILARITY_FLOOR
    )
    return {
      allowed: confidence >= minConfidence && similarity >= minSimilarity,
      minConfidence,
      minSimilarity,
    }
  }

  if (direction === "lateral") {
    const minConfidence = config.doubleCheckMinConfidence
    const minSimilarity = Math.max(config.doubleCheckMinSimilarity, LATERAL_MIN_SIMILARITY_FLOOR)
    return {
      allowed: confidence >= minConfidence && similarity >= minSimilarity,
      minConfidence,
      minSimilarity,
    }
  }

  return {
    allowed: confidence >= config.doubleCheckMinConfidence && similarity >= config.doubleCheckMinSimilarity,
    minConfidence: config.doubleCheckMinConfidence,
    minSimilarity: config.doubleCheckMinSimilarity,
  }
}

function assessNewCanonicalRisk(params: {
  canonicalName: string
  category: string | null | undefined
  confidence: number
}): { blocked: boolean; reason: string } {
  const { canonicalName, category, confidence } = params
  const normalized = normalizeCanonicalName(canonicalName)
  const tokens = toCanonicalTokens(normalized)
  const tokenCount = tokens.length
  const hasNumericToken = /\b\d+\b/.test(normalized)
  const noiseHits = tokens.filter((token) => NEW_CANONICAL_NOISE_TOKENS.has(token)).length
  const categoryUnknown = !category || category === "other"

  if (confidence < NEW_CANONICAL_MIN_CONFIDENCE && tokenCount > 2) {
    return {
      blocked: true,
      reason: `low_confidence_long_name(min_confidence=${NEW_CANONICAL_MIN_CONFIDENCE.toFixed(2)}, tokens=${tokenCount})`,
    }
  }

  if (tokenCount > NEW_CANONICAL_MAX_TOKEN_COUNT && confidence < NEW_CANONICAL_LONG_NAME_MIN_CONFIDENCE) {
    return {
      blocked: true,
      reason:
        `long_name_requires_higher_confidence(min_confidence=${NEW_CANONICAL_LONG_NAME_MIN_CONFIDENCE.toFixed(2)}, ` +
        `tokens=${tokenCount})`,
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

function hasUnitAlias(raw: string, alias: string): boolean {
  if (!raw || !alias) return false
  const flexibleAlias = escapeRegExp(alias.trim()).replace(/\s+/g, "[\\s.-]*")
  const pattern = new RegExp(`(?<![a-z])${flexibleAlias}(?![a-z])`, "i")
  return pattern.test(raw)
}

function hasExplicitUnitSignals(row: IngredientMatchQueueRow): boolean {
  const rawUnit = normalizeSpaces((row.raw_unit || "").toLowerCase())
  if (rawUnit) return true

  const rawText = normalizeSpaces(`${row.cleaned_name || ""} ${row.raw_product_name || ""}`.toLowerCase())
  if (!rawText) return false

  const aliases = new Set<string>([
    ...Object.values(RESOLVED_UNIT_ALIASES).flat(),
    ...GENERIC_MEASURE_ALIASES,
    "pack",
    "pk",
    "pkg",
    "package",
    "cnt",
    "dozen",
  ])

  for (const alias of aliases) {
    if (hasUnitAlias(rawText, alias)) {
      return true
    }
  }

  return false
}

function shouldUsePackagedUnitFallback(row: IngredientMatchQueueRow): boolean {
  if (row.source !== "scraper") return false
  return !hasExplicitUnitSignals(row)
}

function buildPackagedUnitFallback(rowId: string): UnitStandardizationResult {
  return {
    id: rowId,
    resolvedUnit: "unit",
    resolvedQuantity: 1,
    confidence: UNIT_FALLBACK_CONFIDENCE,
    status: "success",
  }
}

function collectUnitHints(row: IngredientMatchQueueRow, unitResult?: UnitStandardizationResult): string[] {
  const hints = new Set<string>()
  const addHint = (value?: string | null) => {
    const normalized = normalizeSpaces((value || "").toLowerCase())
    if (!normalized) return

    // Ignore accidental full ingredient lines in raw_unit fallback.
    const tokenCount = normalized.split(" ").length
    if (tokenCount > 3) return
    hints.add(normalized)
  }

  addHint(row.raw_unit)
  addHint(row.resolved_unit)

  if (unitResult?.status === "success" && unitResult.resolvedUnit) {
    const aliases = RESOLVED_UNIT_ALIASES[unitResult.resolvedUnit] || []
    aliases.forEach((alias) => hints.add(alias))
  }

  GENERIC_MEASURE_ALIASES.forEach((alias) => hints.add(alias))

  return Array.from(hints).sort((a, b) => b.length - a.length)
}

function stripMeasurementFromSearchTerm(rawName: string, row: IngredientMatchQueueRow, unitResult?: UnitStandardizationResult): string {
  let working = normalizeSpaces(rawName.toLowerCase())
  if (!working) return rawName

  // Collapse repeated leading quantities (e.g. "1 1 glug ...").
  working = working.replace(/^(\d+(?:\.\d+)?)\s+\1(?=\s)/, "$1")

  const unitHints = collectUnitHints(row, unitResult)
  const hintedUnitsPattern = unitHints.length
    ? `(?:${unitHints.map((hint) => escapeRegExp(hint).replace(/\s+/g, "[\\s.-]*")).join("|")})`
    : ""

  const quantityPattern = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)"
  const leadingQtyUnitPattern = hintedUnitsPattern
    ? new RegExp(`^${quantityPattern}\\s*[-x*]?\\s*${hintedUnitsPattern}\\b\\s*`, "i")
    : null
  const leadingCompactPattern = hintedUnitsPattern
    ? new RegExp(`^${quantityPattern}${hintedUnitsPattern}\\b\\s*`, "i")
    : null
  const leadingQtyOnlyPattern = new RegExp(`^${quantityPattern}\\s+`, "i")
  const trailingUnitPattern = hintedUnitsPattern ? new RegExp(`\\s+${hintedUnitsPattern}$`, "i") : null

  for (let i = 0; i < 4; i += 1) {
    const before = working

    if (leadingQtyUnitPattern) {
      working = working.replace(leadingQtyUnitPattern, "")
    }
    if (leadingCompactPattern) {
      working = working.replace(leadingCompactPattern, "")
    }
    working = working.replace(leadingQtyOnlyPattern, "")

    if (trailingUnitPattern) {
      working = working.replace(trailingUnitPattern, "")
    }

    working = normalizeSpaces(working)
    if (working === before) break
  }

  return working || rawName
}

function getIngredientSearchTerm(row: IngredientMatchQueueRow, unitResult?: UnitStandardizationResult): string {
  const base = getSearchTerm(row)
  if (!base) return base
  return stripMeasurementFromSearchTerm(base, row, unitResult)
}

function resolveRowStandardizerContext(
  row: IngredientMatchQueueRow,
  configuredContext: QueueWorkerConfig["standardizerContext"]
): IngredientStandardizerContext {
  if (configuredContext !== "dynamic") {
    return configuredContext
  }

  if (row.source === "recipe") return "recipe"
  return "pantry"
}

function buildCanonicalDoubleCheckTerms(canonicalName: string): string[] {
  const terms = new Set(buildCanonicalQueryTerms(canonicalName))
  const tokens = normalizeCanonicalName(canonicalName)
    .split(" ")
    .filter(Boolean)

  // Product titles are often noisy; include tail noun terms so we can match
  // canonical base ingredients like "egg", "milk", "gravy mix", "red wine".
  if (tokens.length >= 1) {
    terms.add(tokens[tokens.length - 1])
  }
  if (tokens.length >= 2) {
    terms.add(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`)
  }

  return Array.from(terms).filter(Boolean)
}

function logCanonicalDoubleCheckDecision(params: {
  sourceCanonical: string
  targetCanonical: string
  decision: "remapped" | "skipped"
  reason: string
  direction: RemapDirection | "unknown"
  confidence: number
  similarity: number
  sourceCategory: string | null | undefined
  targetCategory: string | null | undefined
}): void {
  void ingredientMatchQueueDB
    .logCanonicalDoubleCheckDaily({
      sourceCanonical: params.sourceCanonical,
      targetCanonical: params.targetCanonical,
      decision: params.decision,
      reason: params.reason,
      direction: params.direction,
      aiConfidence: params.confidence,
      similarity: params.similarity,
      sourceCategory: params.sourceCategory ?? null,
      targetCategory: params.targetCategory ?? null,
    })
    .catch((error) => {
      console.warn("[QueueResolver] Failed to log canonical double-check telemetry:", error)
    })
}

async function resolveBlockedNewCanonicalFallback(params: {
  canonicalName: string
}): Promise<{ canonicalName: string; category: string | null; source: string } | null> {
  const candidates: Array<{ canonicalName: string; source: string }> = []
  const seen = new Set<string>()
  const baseCanonical = normalizeCanonicalName(params.canonicalName)

  const addCandidate = (value: string | null | undefined, source: string): void => {
    const normalized = normalizeCanonicalName(value || "")
    if (!normalized || normalized === baseCanonical || seen.has(normalized)) return
    if (INVALID_CANONICAL_NAMES.has(normalized)) return
    seen.add(normalized)
    candidates.push({ canonicalName: normalized, source })
  }

  const baseTokens = toCanonicalTokens(baseCanonical)
  if (baseTokens.length >= 2) {
    addCandidate(baseTokens.slice(-2).join(" "), "tail_2_tokens")
  }
  if (baseTokens.length >= 3) {
    addCandidate(baseTokens.slice(-3).join(" "), "tail_3_tokens")
  }

  for (const candidate of candidates) {
    const existing = await standardizedIngredientsDB.findByCanonicalName(candidate.canonicalName)
    if (!existing?.canonical_name) continue
    return {
      canonicalName: existing.canonical_name,
      category: existing.category ?? null,
      source: candidate.source,
    }
  }

  return null
}

async function resolveCanonicalWithDoubleCheck(
  canonicalName: string,
  category: string | null | undefined,
  confidence: number,
  config: QueueWorkerConfig
): Promise<string> {
  const normalizedCanonical = normalizeCanonicalName(canonicalName)
  if (!normalizedCanonical) return ""

  if (confidence < config.doubleCheckMinConfidence) {
    return normalizedCanonical
  }

  const exact = await standardizedIngredientsDB.findByCanonicalName(normalizedCanonical)
  if (exact?.canonical_name) {
    return exact.canonical_name
  }

  const queryTerms = buildCanonicalDoubleCheckTerms(normalizedCanonical)
  const collected = new Map<string, CanonicalCandidate>()

  for (const term of queryTerms) {
    const [textMatches, variantMatches] = await Promise.all([
      standardizedIngredientsDB.searchByText(term, { limit: 12 }),
      standardizedIngredientsDB.searchByVariants([term]),
    ])

    for (const row of [...textMatches, ...variantMatches]) {
      const candidateName = normalizeCanonicalName(row.canonical_name || "")
      if (!candidateName) continue
      if (!collected.has(candidateName)) {
        collected.set(candidateName, {
          canonicalName: candidateName,
          category: row.category ?? null,
        })
      }
    }
  }

  if (!collected.size) {
    return normalizedCanonical
  }

  let bestMatch: CanonicalCandidate | null = null
  let bestScore = 0

  for (const candidate of collected.values()) {
    let score = scoreCanonicalSimilarity(normalizedCanonical, candidate.canonicalName)

    if (category && candidate.category && category !== candidate.category) {
      score -= CROSS_CATEGORY_SCORE_PENALTY
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  if (bestMatch && bestScore >= config.doubleCheckMinSimilarity) {
    if (bestMatch.canonicalName !== normalizedCanonical) {
      const direction = resolveRemapDirection(normalizedCanonical, bestMatch.canonicalName)
      const crossCategoryMismatch =
        Boolean(category && bestMatch.category && category !== bestMatch.category)

      if (crossCategoryMismatch) {
        const minCrossCategorySimilarity = Math.max(
          config.doubleCheckMinSimilarity + CROSS_CATEGORY_MIN_SIMILARITY_BUFFER,
          CROSS_CATEGORY_MIN_SIMILARITY_FLOOR
        )
        if (confidence < CROSS_CATEGORY_MIN_CONFIDENCE || bestScore < minCrossCategorySimilarity) {
          logCanonicalDoubleCheckDecision({
            sourceCanonical: normalizedCanonical,
            targetCanonical: bestMatch.canonicalName,
            decision: "skipped",
            reason: "cross_category_mismatch",
            direction,
            confidence,
            similarity: bestScore,
            sourceCategory: category,
            targetCategory: bestMatch.category,
          })
          console.log(
            `[QueueResolver] Canonical double-check skipped remap "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
              `(reason=cross_category_mismatch, ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)}, ` +
              `required_confidence=${CROSS_CATEGORY_MIN_CONFIDENCE.toFixed(2)}, required_similarity=${minCrossCategorySimilarity.toFixed(3)})`
          )
          return normalizedCanonical
        }
      }

      const asymmetricCheck = meetsAsymmetricRemapPolicy(direction, confidence, bestScore, config)
      if (!asymmetricCheck.allowed) {
        logCanonicalDoubleCheckDecision({
          sourceCanonical: normalizedCanonical,
          targetCanonical: bestMatch.canonicalName,
          decision: "skipped",
          reason: `asymmetric_${direction}`,
          direction,
          confidence,
          similarity: bestScore,
          sourceCategory: category,
          targetCategory: bestMatch.category,
        })
        console.log(
          `[QueueResolver] Canonical double-check skipped remap "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
            `(reason=asymmetric_${direction}, ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)}, ` +
            `required_confidence=${asymmetricCheck.minConfidence.toFixed(2)}, required_similarity=${asymmetricCheck.minSimilarity.toFixed(3)})`
        )
        return normalizedCanonical
      }

      logCanonicalDoubleCheckDecision({
        sourceCanonical: normalizedCanonical,
        targetCanonical: bestMatch.canonicalName,
        decision: "remapped",
        reason: "applied",
        direction,
        confidence,
        similarity: bestScore,
        sourceCategory: category,
        targetCategory: bestMatch.category,
      })
      console.log(
        `[QueueResolver] High-confidence canonical double-check remapped "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
          `(ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)}, direction=${direction})`
      )
    }
    return bestMatch.canonicalName
  }

  if (bestMatch && bestMatch.canonicalName !== normalizedCanonical) {
    logCanonicalDoubleCheckDecision({
      sourceCanonical: normalizedCanonical,
      targetCanonical: bestMatch.canonicalName,
      decision: "skipped",
      reason: "below_similarity_threshold",
      direction: resolveRemapDirection(normalizedCanonical, bestMatch.canonicalName),
      confidence,
      similarity: bestScore,
      sourceCategory: category,
      targetCategory: bestMatch.category,
    })
  }

  return normalizedCanonical
}

async function resolveIngredientCandidates(
  rows: IngredientMatchQueueRow[],
  config: QueueWorkerConfig,
  unitByRowId?: Map<string, UnitStandardizationResult>
): Promise<Map<string, IngredientStandardizationResult>> {
  const targetRows = rows.filter((row) => row.needs_ingredient_review)
  if (!targetRows.length) return new Map()

  const byRowId = new Map<string, IngredientStandardizationResult>()
  const rowsByContext = new Map<IngredientStandardizerContext, IngredientMatchQueueRow[]>()

  for (const row of targetRows) {
    const rowContext = resolveRowStandardizerContext(row, config.standardizerContext)
    const bucket = rowsByContext.get(rowContext)
    if (bucket) {
      bucket.push(row)
    } else {
      rowsByContext.set(rowContext, [row])
    }
  }

  for (const [context, contextRows] of rowsByContext.entries()) {
    const uniqueInputByKey = new Map<string, { id: string; name: string; cacheKey: string }>()
    const rowToInputKey = new Map<string, string>()
    const cleanedNameUpdatePromises: Array<Promise<unknown>> = []

    for (const row of contextRows) {
      const originalSearchTerm = getSearchTerm(row)
      const searchTerm = getIngredientSearchTerm(row, unitByRowId?.get(row.id))
      const dedupeKey = searchTerm.toLowerCase()
      const cacheKey = buildIngredientLocalCacheKey(context, searchTerm)

      if (!uniqueInputByKey.has(dedupeKey)) {
        uniqueInputByKey.set(dedupeKey, { id: dedupeKey, name: searchTerm, cacheKey })
      }

      rowToInputKey.set(row.id, dedupeKey)

      if (
        !config.dryRun &&
        searchTerm &&
        searchTerm !== originalSearchTerm &&
        row.cleaned_name !== searchTerm
      ) {
        cleanedNameUpdatePromises.push(
          ingredientMatchQueueDB
            .update(row.id, {
              cleaned_name: searchTerm,
            } as IngredientMatchQueueUpdate)
            .catch((error) => {
              console.warn(
                `[QueueResolver] Failed to persist cleaned_name normalization for row ${row.id}:`,
                error
              )
            })
        )
      }
    }

    if (cleanedNameUpdatePromises.length) {
      await Promise.allSettled(cleanedNameUpdatePromises)
    }

    const aiResultByKey = new Map<string, IngredientStandardizationResult>()
    const uniqueInputs = Array.from(uniqueInputByKey.values())
    const inputById = new Map(uniqueInputs.map((item) => [item.id, item]))

    const cachedByCacheKey = await localQueueAICache.getMany<IngredientLocalCachePayload>({
      namespace: "ingredient",
      cacheVersion: INGREDIENT_LOCAL_CACHE_VERSION,
      keys: uniqueInputs.map((item) => item.cacheKey),
      maxAgeDays: INGREDIENT_LOCAL_CACHE_MAX_AGE_DAYS,
    })

    let cacheHitCount = 0
    const aiInputs: Array<{ id: string; name: string }> = []

    for (const input of uniqueInputs) {
      const cachedPayload = cachedByCacheKey.get(input.cacheKey)
      const cachedResult =
        cachedPayload ? fromIngredientLocalCachePayload(cachedPayload, input.id, input.name) : null

      if (cachedResult) {
        aiResultByKey.set(input.id, cachedResult)
        cacheHitCount += 1
      } else {
        aiInputs.push({ id: input.id, name: input.name })
      }
    }

    if (cacheHitCount > 0) {
      console.log(
        `[QueueResolver] Ingredient AI local cache hits ${cacheHitCount}/${uniqueInputs.length} for context=${context}`
      )
    }

    if (aiInputs.length > 0) {
      const aiResults = await standardizeIngredientsWithAI(aiInputs, context)
      for (const result of aiResults) {
        aiResultByKey.set(result.id, result)
      }

      const cacheWrites: Array<{ key: string; value: IngredientLocalCachePayload }> = []
      for (const result of aiResults) {
        const input = inputById.get(result.id)
        if (!input) continue
        const payload = toIngredientLocalCachePayload(result)
        if (!payload) continue
        cacheWrites.push({
          key: input.cacheKey,
          value: payload,
        })
      }

      if (cacheWrites.length > 0) {
        await localQueueAICache.setMany({
          namespace: "ingredient",
          cacheVersion: INGREDIENT_LOCAL_CACHE_VERSION,
          entries: cacheWrites,
        })
      }

      if (cacheHitCount > 0) {
        console.log(
          `[QueueResolver] Ingredient AI local cache misses ${aiInputs.length}/${uniqueInputs.length} for context=${context}`
        )
      }
    }

    for (const row of contextRows) {
      const inputKey = rowToInputKey.get(row.id)
      if (!inputKey) continue
      const result = aiResultByKey.get(inputKey)
      if (result) {
        byRowId.set(row.id, result)
      }
    }
  }

  return byRowId
}

async function resolveUnitCandidates(
  rows: IngredientMatchQueueRow[],
  ingredientByRowId: Map<string, IngredientStandardizationResult> | undefined,
  config: QueueWorkerConfig
): Promise<Map<string, UnitStandardizationResult>> {
  if (!config.enableUnitResolution) return new Map()

  const targetRows = rows.filter((row) => row.needs_unit_review)
  if (!targetRows.length) return new Map()

  const fallbackRows = targetRows.filter((row) => shouldUsePackagedUnitFallback(row))
  const rowsRequiringAI = targetRows.filter((row) => !shouldUsePackagedUnitFallback(row))

  const byRowId = new Map<string, UnitStandardizationResult>()
  for (const row of fallbackRows) {
    byRowId.set(row.id, buildPackagedUnitFallback(row.id))
  }

  if (fallbackRows.length > 0) {
    console.log(
      `[QueueResolver] Applied packaged-item unit fallback (unit=1 unit, confidence=${UNIT_FALLBACK_CONFIDENCE}) for ${fallbackRows.length} row(s) with no explicit unit signals`
    )
  }

  if (!rowsRequiringAI.length) {
    return byRowId
  }

  const uniqueInputByKey = new Map<string, Parameters<typeof standardizeUnitsWithAI>[0][number]>()
  const rowToInputKey = new Map<string, string>()

  for (const row of rowsRequiringAI) {
    const ingredientCanonical =
      ingredientByRowId?.get(row.id)?.canonicalName ?? row.best_fuzzy_match ?? undefined
    const dedupeKey = [
      getSearchTerm(row).toLowerCase(),
      (row.raw_unit ?? "").trim().toLowerCase(),
      row.source,
      (ingredientCanonical ?? "").trim().toLowerCase(),
    ].join("|")

    if (!uniqueInputByKey.has(dedupeKey)) {
      uniqueInputByKey.set(dedupeKey, {
        id: dedupeKey,
        rawProductName: row.raw_product_name,
        cleanedName: row.cleaned_name,
        rawUnit: row.raw_unit,
        source: row.source,
        knownIngredientCanonicalName: ingredientCanonical,
      })
    }

    rowToInputKey.set(row.id, dedupeKey)
  }

  const aiResults = await standardizeUnitsWithAI(Array.from(uniqueInputByKey.values()))
  const aiResultByKey = new Map(aiResults.map((result) => [result.id, result]))

  for (const row of rowsRequiringAI) {
    const inputKey = rowToInputKey.get(row.id)
    if (!inputKey) continue
    const result = aiResultByKey.get(inputKey)
    if (result) {
      byRowId.set(row.id, result)
    }
  }

  return byRowId
}

function shouldRerunUnitResolution(
  row: IngredientMatchQueueRow,
  current: UnitStandardizationResult | undefined,
  config: QueueWorkerConfig
): boolean {
  if (!row.needs_unit_review) return false
  if (shouldUsePackagedUnitFallback(row)) return false
  if (!current) return true
  if (current.status !== "success") return true
  return normalizeConfidence(current.confidence, 0) < config.unitMinConfidence
}

function choosePreferredUnitResult(
  current: UnitStandardizationResult | undefined,
  candidate: UnitStandardizationResult | undefined
): UnitStandardizationResult | undefined {
  if (!candidate) return current
  if (!current) return candidate

  if (candidate.status === "success" && current.status !== "success") {
    return candidate
  }

  if (candidate.status !== "success" && current.status === "success") {
    return current
  }

  const currentConfidence = normalizeConfidence(current.confidence, 0)
  const candidateConfidence = normalizeConfidence(candidate.confidence, 0)
  return candidateConfidence > currentConfidence ? candidate : current
}

async function rerunUnitCandidatesWithIngredientContext(
  rows: IngredientMatchQueueRow[],
  existingUnitByRowId: Map<string, UnitStandardizationResult>,
  ingredientByRowId: Map<string, IngredientStandardizationResult>,
  config: QueueWorkerConfig
): Promise<Map<string, UnitStandardizationResult>> {
  if (!config.enableUnitResolution) return existingUnitByRowId

  const rerunRows = rows.filter((row) =>
    shouldRerunUnitResolution(row, existingUnitByRowId.get(row.id), config)
  )
  if (!rerunRows.length) return existingUnitByRowId

  const rerunUnitByRowId = await resolveUnitCandidates(rerunRows, ingredientByRowId, config)
  const merged = new Map(existingUnitByRowId)
  let improvedCount = 0

  for (const row of rerunRows) {
    const rowId = row.id
    const current = existingUnitByRowId.get(rowId)
    const candidate = rerunUnitByRowId.get(rowId)
    const preferred = choosePreferredUnitResult(current, candidate)

    if (preferred) {
      merged.set(rowId, preferred)
    }

    if (preferred && preferred !== current) {
      improvedCount += 1
    }
  }

  if (improvedCount > 0) {
    console.log(
      `[QueueResolver] Unit second-pass improved ${improvedCount}/${rerunRows.length} row(s) using ingredient context`
    )
  }

  return merged
}

async function resolveBatch(rows: IngredientMatchQueueRow[], config: QueueWorkerConfig): Promise<ResolveBatchResult> {
  const detailedResults: ResolveBatchResult["results"] = config.dryRun ? [] : undefined
  const validRows = rows.filter((row) => {
    const searchTerm = getSearchTerm(row)
    if (!searchTerm) {
      const reason = "Row missing a canonicalizable ingredient name"
      console.warn(`[QueueResolver] Row ${row.id} ${reason}.`)
      if (!config.dryRun) {
        ingredientMatchQueueDB.markFailed(row.id, config.resolverName, reason).catch(console.error)
      }
      return false
    }
    return true
  })

  if (!validRows.length) {
    return { resolved: 0, failed: rows.length, results: detailedResults }
  }

  try {
    const firstPassUnitByRowId = await resolveUnitCandidates(validRows, undefined, config)
    const ingredientByRowId = await resolveIngredientCandidates(validRows, config, firstPassUnitByRowId)
    const unitByRowId = await rerunUnitCandidatesWithIngredientContext(
      validRows,
      firstPassUnitByRowId,
      ingredientByRowId,
      config
    )

    const results = await Promise.allSettled(
      validRows.map(async (row) => {
        const needsIngredient = row.needs_ingredient_review === true
        const needsUnit = row.needs_unit_review === true

        if (!needsIngredient && !needsUnit) {
          throw new Error("Queue row has no active review flags")
        }

        let canonicalForWrite = getCanonicalFallback(row)
        let ingredientCategory: string | null = null
        let ingredientConfidence = normalizeConfidence(row.fuzzy_score, 0.5)

        if (needsIngredient) {
          const ingredientResult = ingredientByRowId.get(row.id)
          if (!ingredientResult || !ingredientResult.canonicalName) {
            throw new Error("AI returned no canonical name")
          }

          const normalizedCanonical = normalizeCanonicalName(ingredientResult.canonicalName)
          if (!normalizedCanonical) {
            throw new Error("AI returned an empty canonical name")
          }

          if (INVALID_CANONICAL_NAMES.has(normalizedCanonical)) {
            throw new Error(`Invalid canonical name "${normalizedCanonical}" returned by ingredient resolver`)
          }

          let resolvedIngredientCategory = ingredientResult.category?.trim() || null
          if (!resolvedIngredientCategory) {
            const existingCanonical = await standardizedIngredientsDB.findByCanonicalName(normalizedCanonical)
            resolvedIngredientCategory = existingCanonical?.category ?? null
          }
          if (!resolvedIngredientCategory) {
            resolvedIngredientCategory = "other"
            console.warn(
              `[QueueResolver] Missing ingredient category for "${normalizedCanonical}". Falling back to "other".`
            )
          }

          canonicalForWrite = await resolveCanonicalWithDoubleCheck(
            normalizedCanonical,
            resolvedIngredientCategory,
            ingredientResult.confidence,
            config
          )
          if (!canonicalForWrite) {
            throw new Error("Canonical name became empty after double-check")
          }

          ingredientCategory = resolvedIngredientCategory
          ingredientConfidence = normalizeConfidence(ingredientResult.confidence, 0.5)
        }

        const unitResult = needsUnit ? unitByRowId.get(row.id) : undefined
        const usedPackagedUnitFallback =
          needsUnit &&
          shouldUsePackagedUnitFallback(row) &&
          unitResult?.status === "success" &&
          unitResult.resolvedUnit === "unit" &&
          unitResult.resolvedQuantity === 1
        const unitConfidence = normalizeConfidence(unitResult?.confidence, 0)
        const shouldWriteUnit = config.enableUnitResolution && !config.unitDryRun
        const unitLowConfidence =
          needsUnit &&
          shouldWriteUnit &&
          unitResult?.status === "success" &&
          unitConfidence < config.unitMinConfidence

        if (needsUnit && shouldWriteUnit) {
          if (!unitResult) {
            throw new Error("AI returned no unit result")
          }
          if (unitResult.status !== "success") {
            throw new Error(unitResult.error || "Unit resolver returned error")
          }
          if (!usedPackagedUnitFallback && unitResult.confidence < config.unitMinConfidence) {
            throw new Error(
              `Unit confidence ${unitResult.confidence.toFixed(3)} below threshold ${config.unitMinConfidence.toFixed(3)}`
            )
          }
          if (!unitResult.resolvedUnit || !unitResult.resolvedQuantity) {
            throw new Error("Unit resolver returned incomplete resolution payload")
          }
        }

        if (!config.dryRun) {
          if (needsIngredient) {
            let existingCanonical = await standardizedIngredientsDB.findByCanonicalName(canonicalForWrite)
            if (!existingCanonical) {
              let risk = assessNewCanonicalRisk({
                canonicalName: canonicalForWrite,
                category: ingredientCategory,
                confidence: ingredientConfidence,
              })

              if (risk.blocked) {
                const fallback = await resolveBlockedNewCanonicalFallback({
                  canonicalName: canonicalForWrite,
                })

                if (fallback) {
                  canonicalForWrite = fallback.canonicalName
                  ingredientCategory = fallback.category ?? ingredientCategory
                  existingCanonical = await standardizedIngredientsDB.findByCanonicalName(canonicalForWrite)
                  if (existingCanonical) {
                    console.warn(
                      `[QueueResolver] Recovered blocked canonical "${normalizedCanonical}" -> "${canonicalForWrite}" ` +
                        `(source=${fallback.source}, block_reason=${risk.reason})`
                    )
                  }
                }

                if (!existingCanonical) {
                  risk = assessNewCanonicalRisk({
                    canonicalName: canonicalForWrite,
                    category: ingredientCategory,
                    confidence: ingredientConfidence,
                  })
                }
              }

              if (!existingCanonical && risk.blocked) {
                throw new Error(
                  `Blocked new canonical creation for "${canonicalForWrite}" (${risk.reason}, ` +
                    `confidence=${ingredientConfidence.toFixed(3)}, category=${ingredientCategory || "null"})`
                )
              }
            }

            const standardized =
              existingCanonical || (await standardizedIngredientsDB.getOrCreate(canonicalForWrite, ingredientCategory))
            if (!standardized?.id) {
              throw new Error("Failed to upsert standardized ingredient")
            }

            if (needsUnit && shouldWriteUnit && unitResult?.status === "success") {
              const success = await ingredientMatchQueueDB.markResolved({
                rowId: row.id,
                canonicalName: canonicalForWrite,
                resolvedIngredientId: standardized.id,
                confidence: ingredientConfidence,
                resolver: config.resolverName,
                resolvedUnit: unitResult.resolvedUnit,
                resolvedQuantity: unitResult.resolvedQuantity,
                unitConfidence: unitResult.confidence,
                quantityConfidence: unitResult.confidence,
                clearIngredientReviewFlag: true,
                clearUnitReviewFlag: true,
              })

              if (!success) {
                throw new Error("Failed to persist queue resolution status")
              }

              console.log(
                `[QueueResolver] ${row.id} -> ${canonicalForWrite} (${standardized.id}) + unit ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit}` +
                  (usedPackagedUnitFallback ? " [PACKAGED FALLBACK]" : "")
              )
            } else if (needsUnit) {
              const success = await ingredientMatchQueueDB.markIngredientResolvedPendingUnit({
                rowId: row.id,
                canonicalName: canonicalForWrite,
                resolvedIngredientId: standardized.id,
                confidence: ingredientConfidence,
                resolver: config.resolverName,
              })

              if (!success) {
                throw new Error("Failed to persist ingredient-only resolution")
              }

              if (config.enableUnitResolution && config.unitDryRun && unitResult?.status === "success") {
                console.log(
                  `[QueueResolver] [UNIT DRY RUN] ${row.id} candidate ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit} ` +
                    `(confidence=${unitResult.confidence.toFixed(3)})`
                )
              }

              console.log(
                `[QueueResolver] ${row.id} ingredient resolved (${standardized.id}); left pending for unit review`
              )
            } else {
              const success = await ingredientMatchQueueDB.markResolved({
                rowId: row.id,
                canonicalName: canonicalForWrite,
                resolvedIngredientId: standardized.id,
                confidence: ingredientConfidence,
                resolver: config.resolverName,
                clearIngredientReviewFlag: true,
                clearUnitReviewFlag: true,
              })

              if (!success) {
                throw new Error("Failed to persist queue resolution status")
              }

              console.log(`[QueueResolver] ${row.id} -> ${canonicalForWrite} (${standardized.id})`)
            }
          } else if (needsUnit && shouldWriteUnit && unitResult?.status === "success") {
            const success = await ingredientMatchQueueDB.markResolved({
              rowId: row.id,
              canonicalName: canonicalForWrite,
              confidence: ingredientConfidence,
              resolver: config.resolverName,
              resolvedUnit: unitResult.resolvedUnit,
              resolvedQuantity: unitResult.resolvedQuantity,
              unitConfidence: unitResult.confidence,
              quantityConfidence: unitResult.confidence,
              clearIngredientReviewFlag: true,
              clearUnitReviewFlag: true,
            })

            if (!success) {
              throw new Error("Failed to persist unit-only queue resolution")
            }

            console.log(
              `[QueueResolver] ${row.id} unit resolved -> ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit}` +
                (usedPackagedUnitFallback ? " [PACKAGED FALLBACK]" : "")
            )
          } else if (needsUnit && config.enableUnitResolution && config.unitDryRun) {
            throw new Error("Unit dry run cannot be used for unit-only rows")
          } else if (needsUnit) {
            throw new Error("Unit resolution is disabled for a unit-review row")
          }
        } else {
          if (needsUnit && config.enableUnitResolution && unitResult?.status === "success") {
            const lowConfidenceNote = unitLowConfidence ? " [LOW CONFIDENCE]" : ""
            const fallbackNote = usedPackagedUnitFallback ? " [PACKAGED FALLBACK]" : ""
            console.log(
              `[QueueResolver] [DRY RUN] ${row.id} unit candidate -> ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit} ` +
                `(confidence=${unitResult.confidence.toFixed(3)})${lowConfidenceNote}${fallbackNote}`
            )
          }
          if (needsIngredient) {
            console.log(`[QueueResolver] [DRY RUN] ${row.id} -> ${canonicalForWrite}`)
          }
        }

        return {
          rowId: row.id,
          originalName: row.cleaned_name || row.raw_product_name || "",
          canonicalName: canonicalForWrite,
          category: ingredientCategory,
          confidence: ingredientConfidence,
          resolvedUnit: unitResult?.status === "success" ? unitResult.resolvedUnit : null,
          resolvedQuantity: unitResult?.status === "success" ? unitResult.resolvedQuantity : null,
          unitConfidence: unitResult?.status === "success" ? unitResult.confidence : null,
          quantityConfidence: unitResult?.status === "success" ? unitResult.confidence : null,
        }
      })
    )

    let resolved = 0
    let failed = 0

    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        resolved += 1
        if (config.dryRun && detailedResults) {
          detailedResults.push({
            ...result.value,
            status: "success",
          })
        }
        return
      }

      failed += 1
      const row = validRows[idx]
      if (!row) return

      const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
      console.error(`[QueueResolver] ${row.id} failed to resolve:`, errorMessage)
      if (!config.dryRun) {
        ingredientMatchQueueDB.markFailed(row.id, config.resolverName, errorMessage).catch(console.error)
      }
      if (config.dryRun && detailedResults) {
        detailedResults.push({
          rowId: row.id,
          originalName: row.cleaned_name || row.raw_product_name || "",
          canonicalName: "",
          category: null,
          confidence: 0,
          status: "error",
          error: errorMessage,
        })
      }
    })

    return { resolved, failed: failed + (rows.length - validRows.length), results: detailedResults }
  } catch (error) {
    console.error("[QueueResolver] Batch processing failed:", error)
    if (!config.dryRun) {
      await Promise.allSettled(
        validRows.map((row) =>
          ingredientMatchQueueDB.markFailed(
            row.id,
            config.resolverName,
            error instanceof Error ? error.message : String(error)
          )
        )
      )
    }
    return { resolved: 0, failed: rows.length, results: detailedResults }
  }
}

export async function runIngredientQueueResolver(config: QueueWorkerConfig): Promise<QueueRunSummary> {
  if (!config.enableUnitResolution && config.reviewMode !== "ingredient") {
    throw new Error(
      "QUEUE_REVIEW_MODE=unit|any requires QUEUE_ENABLE_UNIT_RESOLUTION=true. Default ingredient mode remains unchanged."
    )
  }

  if (config.unitDryRun && config.reviewMode !== "ingredient" && !config.dryRun) {
    throw new Error(
      "QUEUE_UNIT_DRY_RUN=true only supports QUEUE_REVIEW_MODE=ingredient for non-dry runs to avoid claiming unit-only rows."
    )
  }

  const mode = config.dryRun ? "[DRY RUN]" : ""
  console.log(`[QueueResolver] ${mode} Starting run (limit ${config.batchLimit})`)
  console.log(
    `[QueueResolver] ${mode} Canonical double-check: enabled (min_confidence=${config.doubleCheckMinConfidence}, min_similarity=${config.doubleCheckMinSimilarity})`
  )
  console.log(
    `[QueueResolver] ${mode} Unit resolver: enabled=${config.enableUnitResolution}, unit_dry_run=${config.unitDryRun}, unit_min_confidence=${config.unitMinConfidence}`
  )

  let cycle = 0
  let totalResolved = 0
  let totalFailed = 0
  const dryRunResults: ResolveBatchResult["results"] = config.dryRun ? [] : undefined

  while (true) {
    if (config.maxCycles > 0 && cycle >= config.maxCycles) {
      console.log(`[QueueResolver] ${mode} Reached max cycle limit (${config.maxCycles})`)
      break
    }

    if (!config.dryRun) {
      const requeued = await ingredientMatchQueueDB.requeueExpired(
        Math.max(config.batchLimit * 2, 100),
        "Lease expired before completion"
      )
      if (requeued > 0) {
        console.log(`[QueueResolver] ${mode} Requeued ${requeued} expired processing row(s)`)
      }
    }

    console.log(`[QueueResolver] ${mode} Fetch cycle ${cycle + 1} (limit ${config.batchLimit})`)
    const pending = config.dryRun
      ? await ingredientMatchQueueDB.fetchPendingFiltered({
        limit: config.batchLimit,
        reviewMode: config.reviewMode,
        source: config.queueSource,
      })
      : await ingredientMatchQueueDB.claimPending({
        limit: config.batchLimit,
        resolver: config.resolverName,
        leaseSeconds: config.leaseSeconds,
        reviewMode: config.reviewMode,
        source: config.queueSource,
      })

    if (!pending.length) {
      if (cycle === 0) {
        console.log(`[QueueResolver] ${mode} No pending matches`)
      } else {
        console.log(`[QueueResolver] ${mode} Queue drained after ${cycle} cycle(s)`)
      }
      break
    }

    cycle += 1

    const chunks = chunkItems(pending, config.chunkSize)
    console.log(
      `[QueueResolver] ${mode} Processing ${pending.length} items in ${chunks.length} chunk(s), concurrency=${config.chunkConcurrency}`
    )

    const chunkResults = await mapWithConcurrency(chunks, config.chunkConcurrency, async (chunk, index) => {
      console.log(`[QueueResolver] ${mode} Processing chunk ${index + 1}/${chunks.length} (${chunk.length} items)`)
      const result = await resolveBatch(chunk, config)
      console.log(
        `[QueueResolver] ${mode} Chunk ${index + 1} complete (resolved=${result.resolved}, failed=${result.failed})`
      )
      return result
    })

    let cycleResolved = 0
    let cycleFailed = 0

    for (const result of chunkResults) {
      cycleResolved += result.resolved
      cycleFailed += result.failed
      if (config.dryRun && result.results && dryRunResults) {
        dryRunResults.push(...result.results)
      }
    }

    totalResolved += cycleResolved
    totalFailed += cycleFailed

    console.log(`[QueueResolver] ${mode} Cycle ${cycle} complete (resolved=${cycleResolved}, failed=${cycleFailed})`)

    if (config.dryRun) {
      console.log(`[QueueResolver] ${mode} Dry run stopping after one cycle before clearing the rest of the queue.`)
      break
    }
  }

  if (cycle > 0) {
    console.log(
      `[QueueResolver] ${mode} Completed ${cycle} cycle(s) (total_resolved=${totalResolved}, total_failed=${totalFailed})`
    )
  }

  return {
    cycles: cycle,
    totalResolved,
    totalFailed,
    dryRunResults,
  }
}
