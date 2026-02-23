import {
  ingredientMatchQueueDB,
  type IngredientMatchQueueRow,
  type IngredientMatchQueueUpdate,
} from "../../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../../lib/database/standardized-ingredients-db"
import { standardizeIngredientsWithAI, type IngredientStandardizationResult } from "../../lib/ingredient-standardizer"
import { standardizeUnitsWithAI, type UnitStandardizationResult } from "../../lib/unit-standardizer"
import { normalizeConfidence } from "../../lib/utils/number"
import type { IngredientStandardizerContext } from "../../lib/utils/ingredient-standardizer-context"
import { normalizeCanonicalName, singularizeCanonicalName } from "../../scripts/utils/canonical-matching"
import type { QueueWorkerConfig } from "../config"
import { chunkItems, mapWithConcurrency } from "./batching"
import { resolveCanonicalWithDoubleCheck } from "./canonical-double-check"
import {
  INVALID_CANONICAL_NAMES,
  NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES,
  assessNewCanonicalRisk,
  resolveBlockedNewCanonicalFallback,
} from "./canonical-risk"
import { getIngredientConfidenceCalibrator } from "./confidence-calibration"
import { localProbationCache } from "./probation-cache"
import {
  INGREDIENT_LOCAL_CACHE_VERSION,
  INGREDIENT_LOCAL_CACHE_MAX_AGE_DAYS,
  type IngredientLocalCachePayload,
  buildIngredientLocalCacheKey,
  toIngredientLocalCachePayload,
  fromIngredientLocalCachePayload,
} from "./ingredient-cache-utils"
import { localQueueAICache } from "./local-ai-cache"
import { getLearnedVarietySensitivity, type LearnedVarietySensitivity } from "./sensitive-token-learning"
import {
  shouldUsePackagedUnitFallback,
  shouldUsePackagedUnitFallbackAfterFailure,
  buildPackagedUnitFallback,
  isPackagedUnitFallbackResult,
  UNIT_FALLBACK_CONFIDENCE,
  stripMeasurementFromSearchTerm,
} from "./unit-resolution-utils"

interface ResolveBatchResult {
  resolved: number
  failed: number
  unitMetrics: UnitMetrics
  results?: Array<{
    rowId: string
    originalName: string
    canonicalName: string
    isFoodItem: boolean | null
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
  unitMetrics: UnitMetrics
  dryRunResults?: ResolveBatchResult["results"]
}

interface UnitMetrics {
  mapMissThenFallback: number
  aiSuccess: number
  aiError: number
}

function emptyUnitMetrics(): UnitMetrics {
  return {
    mapMissThenFallback: 0,
    aiSuccess: 0,
    aiError: 0,
  }
}

function isUnitResolutionError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase()
  return (
    normalized.includes("no explicit unit found in raw unit/product name") ||
    normalized.includes("resolved unit") ||
    normalized.includes("resolved quantity missing/invalid") ||
    normalized.includes("resolved unit missing/invalid") ||
    normalized.includes("no unit found in raw text") ||
    normalized.includes("unable to infer unit from raw unit/product name") ||
    normalized.includes("ai returned no unit result") ||
    normalized.includes("unit resolver returned") ||
    normalized.includes("unit confidence") ||
    normalized.includes("unit resolution is disabled") ||
    normalized.includes("unit dry run cannot be used")
  )
}

const PROTECTED_FORM_TOKENS = new Set([
  "paste",
  "powder",
  "sauce",
  "broth",
  "stock",
  "puree",
  "extract",
  "juice",
  "syrup",
  "flakes",
  "seasoning",
  "mix",
])

function getSearchTerm(row: IngredientMatchQueueRow): string {
  return (row.cleaned_name || row.raw_product_name || "").trim()
}

function buildCanonicalProbationSourceSignature(row: IngredientMatchQueueRow, sourceSearchTerm: string): string {
  if (row.product_mapping_id) {
    return `product_mapping:${row.product_mapping_id}`
  }

  if (row.recipe_ingredient_id) {
    return `recipe_ingredient:${row.recipe_ingredient_id}`
  }

  const normalizedSearch = normalizeCanonicalName(sourceSearchTerm)
  if (normalizedSearch) {
    return `${row.source}:${normalizedSearch}`
  }

  return `${row.source}:row:${row.id}`
}

function inferIngredientSemanticRejectReason(errorMessage: string): string | null {
  const normalized = errorMessage.toLowerCase()

  if (normalized.includes("blocked new canonical creation")) return "blocked_new_canonical"
  if (normalized.includes("invalid canonical name")) return "invalid_canonical"
  if (normalized.includes("ai returned no canonical name")) return "empty_canonical"
  if (normalized.includes("canonical name became empty")) return "canonical_cleared"

  // Calibration should only learn from ingredient-semantic failures.
  // Unit failures, infra failures, and probation holds are excluded.
  return null
}

function getCanonicalFallback(row: IngredientMatchQueueRow): string {
  const fallback = row.best_fuzzy_match || row.cleaned_name || row.raw_product_name || "unknown ingredient"
  return normalizeCanonicalName(fallback) || "unknown ingredient"
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

function maybeRetainFormSpecificCanonical(params: {
  sourceSearchTerm: string
  modelCanonical: string
}): { canonicalName: string; reason: string } | null {
  const sourceCanonical = normalizeCanonicalName(params.sourceSearchTerm)
  const modelCanonical = normalizeCanonicalName(params.modelCanonical)
  if (!sourceCanonical || !modelCanonical || sourceCanonical === modelCanonical) return null

  const sourceTokens = sourceCanonical.split(" ").filter(Boolean)
  const modelTokens = new Set(modelCanonical.split(" ").filter(Boolean))
  if (!sourceTokens.length || !modelTokens.size) return null

  const sourceFormTokens = sourceTokens.filter((token) => PROTECTED_FORM_TOKENS.has(token))
  if (!sourceFormTokens.length) return null

  const missingFormTokens = sourceFormTokens.filter((token) => !modelTokens.has(token))
  if (!missingFormTokens.length) return null

  const sourceBaseTokens = sourceTokens.filter((token) => !PROTECTED_FORM_TOKENS.has(token))
  const sharedBaseTokens = sourceBaseTokens.filter((token) => modelTokens.has(token))
  if (!sharedBaseTokens.length) return null

  return {
    canonicalName: sourceCanonical,
    reason: `form_retention(missing_forms=${missingFormTokens.join("|")})`,
  }
}

function maybeRetainVarietyCanonical(params: {
  sourceSearchTerm: string
  modelCanonical: string
  learnedSensitivity: LearnedVarietySensitivity
}): { canonicalName: string; reason: string } | null {
  const sourceCanonical = normalizeCanonicalName(params.sourceSearchTerm)
  const modelCanonical = normalizeCanonicalName(params.modelCanonical)
  if (!sourceCanonical || !modelCanonical || sourceCanonical === modelCanonical) return null

  const sourceTokens = singularizeCanonicalName(sourceCanonical).split(" ").filter(Boolean)
  const modelTokens = singularizeCanonicalName(modelCanonical).split(" ").filter(Boolean)
  if (!sourceTokens.length || !modelTokens.length) return null

  const modelHead = modelTokens[modelTokens.length - 1]
  if (!modelHead || !params.learnedSensitivity.sensitiveHeads.has(modelHead)) return null
  if (!sourceTokens.includes(modelHead)) return null

  const sensitiveModifiers = params.learnedSensitivity.modifiersByHead.get(modelHead)
  if (!sensitiveModifiers || !sensitiveModifiers.size) return null

  const sourceModifiers = sourceTokens.slice(0, -1)
  if (!sourceModifiers.length) return null
  const modelModifierSet = new Set(modelTokens.slice(0, -1))

  const missingVarietyModifiers = sourceModifiers.filter(
    (modifier) => sensitiveModifiers.has(modifier) && !modelModifierSet.has(modifier)
  )
  if (!missingVarietyModifiers.length) return null

  return {
    canonicalName: singularizeCanonicalName(sourceCanonical),
    reason: `variety_retention(head=${modelHead}, missing_modifiers=${missingVarietyModifiers.join("|")})`,
  }
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
  let postFailurePackagedFallbackCount = 0

  for (const row of rowsRequiringAI) {
    const inputKey = rowToInputKey.get(row.id)
    if (!inputKey) continue
    const result = aiResultByKey.get(inputKey)
    if (result?.status === "success") {
      byRowId.set(row.id, result)
      continue
    }

    if (shouldUsePackagedUnitFallbackAfterFailure(row, result)) {
      byRowId.set(row.id, buildPackagedUnitFallback(row.id))
      postFailurePackagedFallbackCount += 1
    }
  }

  if (postFailurePackagedFallbackCount > 0) {
    console.log(
      `[QueueResolver] Applied packaged-item unit fallback (unit=1 unit, confidence=${UNIT_FALLBACK_CONFIDENCE}) ` +
        `for ${postFailurePackagedFallbackCount} row(s) after unit-resolution failure`
    )
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
  if (isPackagedUnitFallbackResult(row, current)) return false
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
  const unitMetrics = emptyUnitMetrics()
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
    return { resolved: 0, failed: rows.length, unitMetrics, results: detailedResults }
  }

  try {
    const learnedVarietySensitivity = await getLearnedVarietySensitivity()
    const confidenceCalibrator = await getIngredientConfidenceCalibrator()
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
        const rowContext = resolveRowStandardizerContext(row, config.standardizerContext)
        let canonicalForWrite = getCanonicalFallback(row)
        let ingredientCategory: string | null = null
        let ingredientConfidence = normalizeConfidence(row.fuzzy_score, 0.5)
        let sourceSearchTerm = getSearchTerm(row)
        let isFoodItem: boolean | null = null
        let rawIngredientConfidence: number | null = null
        let calibratedIngredientConfidence: number | null = null
        let confidenceTokenCount: number | null = null
        let createdNewCanonical = false

        try {
          if (!needsIngredient && !needsUnit) {
            throw new Error("Queue row has no active review flags")
          }

          if (needsIngredient) {
            const ingredientResult = ingredientByRowId.get(row.id)
            if (!ingredientResult || !ingredientResult.canonicalName) {
              throw new Error("AI returned no canonical name")
            }

            sourceSearchTerm = getIngredientSearchTerm(row, unitByRowId.get(row.id))
            isFoodItem = ingredientResult.isFoodItem !== false
            let normalizedCanonical = normalizeCanonicalName(ingredientResult.canonicalName)

            const formRetention = maybeRetainFormSpecificCanonical({
              sourceSearchTerm,
              modelCanonical: normalizedCanonical,
            })
            if (formRetention) {
              normalizedCanonical = formRetention.canonicalName
              console.log(
                `[QueueResolver] Form retention kept "${normalizeCanonicalName(sourceSearchTerm)}" ` +
                  `over model canonical "${normalizeCanonicalName(ingredientResult.canonicalName)}" ` +
                  `(${formRetention.reason})`
              )
            }

            const varietyRetention = maybeRetainVarietyCanonical({
              sourceSearchTerm,
              modelCanonical: normalizedCanonical,
              learnedSensitivity: learnedVarietySensitivity,
            })
            if (varietyRetention) {
              normalizedCanonical = varietyRetention.canonicalName
              console.log(
                `[QueueResolver] Variety retention kept "${normalizeCanonicalName(sourceSearchTerm)}" ` +
                  `over model canonical "${normalizeCanonicalName(ingredientResult.canonicalName)}" ` +
                  `(${varietyRetention.reason})`
              )
            }

            if (!normalizedCanonical) {
              throw new Error("AI returned an empty canonical name")
            }

            if (INVALID_CANONICAL_NAMES.has(normalizedCanonical)) {
              throw new Error(`Invalid canonical name "${normalizedCanonical}" returned by ingredient resolver`)
            }

            rawIngredientConfidence = normalizeConfidence(ingredientResult.confidence, 0.5)
            if (isFoodItem) {
              let resolvedIngredientCategory = ingredientResult.category?.trim() || null
              if (!resolvedIngredientCategory) {
                const existingCanonical = await standardizedIngredientsDB.findByCanonicalName(normalizedCanonical)
                resolvedIngredientCategory =
                  existingCanonical && existingCanonical.is_food_item !== false
                    ? existingCanonical.category
                    : null
              }
              if (!resolvedIngredientCategory) {
                resolvedIngredientCategory = "other"
                console.warn(
                  `[QueueResolver] Missing ingredient category for "${normalizedCanonical}". Falling back to "other".`
                )
              }

              const confidenceCalibration = confidenceCalibrator.calibrate(rawIngredientConfidence)
              calibratedIngredientConfidence = confidenceCalibration.calibrated
              ingredientConfidence = calibratedIngredientConfidence

              if (Math.abs(confidenceCalibration.calibrated - rawIngredientConfidence) >= 0.08) {
                console.log(
                  `[QueueResolver] Confidence calibrated "${normalizedCanonical}" ` +
                    `raw=${rawIngredientConfidence.toFixed(3)} -> calibrated=${confidenceCalibration.calibrated.toFixed(3)} ` +
                    `(bin=${confidenceCalibration.binStart.toFixed(2)}, samples=${confidenceCalibration.binSamples}, ` +
                    `empirical=${confidenceCalibration.empiricalAcceptanceRate.toFixed(3)})`
                )
              }

              canonicalForWrite = await resolveCanonicalWithDoubleCheck(
                normalizedCanonical,
                resolvedIngredientCategory,
                ingredientConfidence,
                config
              )
              if (!canonicalForWrite) {
                throw new Error("Canonical name became empty after double-check")
              }

              ingredientCategory = resolvedIngredientCategory
            } else {
              ingredientCategory = null
              calibratedIngredientConfidence = rawIngredientConfidence
              ingredientConfidence = rawIngredientConfidence
              canonicalForWrite = normalizedCanonical
            }

            confidenceTokenCount = normalizeCanonicalName(canonicalForWrite).split(" ").filter(Boolean).length
          }

          let unitResult = needsUnit ? unitByRowId.get(row.id) : undefined
          const shouldWriteUnit = config.enableUnitResolution && !config.unitDryRun
          const skipUnitForNonFood = needsIngredient && isFoodItem === false
          if (skipUnitForNonFood) {
            unitResult = undefined
          }

          if (needsUnit && shouldWriteUnit && !skipUnitForNonFood) {
            let fallbackReason: string | null = null

            if (!unitResult) {
              fallbackReason = "missing_unit_result"
            } else if (unitResult.status !== "success") {
              fallbackReason = unitResult.error || "unit_resolver_error"
            } else if (!unitResult.resolvedUnit || !unitResult.resolvedQuantity) {
              fallbackReason = "incomplete_unit_payload"
            } else if (unitResult.confidence < config.unitMinConfidence) {
              fallbackReason =
                `low_confidence(${unitResult.confidence.toFixed(3)}<${config.unitMinConfidence.toFixed(3)})`
            }

            if (fallbackReason) {
              unitResult = buildPackagedUnitFallback(row.id)
              console.warn(
                `[QueueResolver] ${row.id} unit fallback applied -> 1 unit ` +
                  `(reason=${fallbackReason}, confidence=${UNIT_FALLBACK_CONFIDENCE.toFixed(3)})`
              )
            }
          }

          const usedPackagedUnitFallback =
            needsUnit && !skipUnitForNonFood && isPackagedUnitFallbackResult(row, unitResult)
          const unitConfidence = normalizeConfidence(unitResult?.confidence, 0)
          const unitLowConfidence =
            needsUnit &&
            !skipUnitForNonFood &&
            shouldWriteUnit &&
            unitResult?.status === "success" &&
            unitConfidence < config.unitMinConfidence

          if (!config.dryRun) {
            if (needsIngredient && isFoodItem === false) {
              const success = await ingredientMatchQueueDB.markResolved({
                rowId: row.id,
                canonicalName: canonicalForWrite,
                resolvedIngredientId: null,
                confidence: ingredientConfidence,
                resolver: config.resolverName,
                isFoodItem: false,
                clearIngredientReviewFlag: true,
                clearUnitReviewFlag: true,
              })

              if (!success) {
                throw new Error("Failed to persist non-food queue resolution status")
              }

              console.log(`[QueueResolver] ${row.id} classified as non-food -> ${canonicalForWrite}`)
            } else if (needsIngredient) {
              let existingCanonical = await standardizedIngredientsDB.findByCanonicalName(canonicalForWrite)
              if (existingCanonical?.is_food_item === false) {
                throw new Error(
                  `Canonical "${canonicalForWrite}" is marked non-food and cannot be used for food resolution`
                )
              }
              if (!existingCanonical) {
                let risk = assessNewCanonicalRisk({
                  canonicalName: canonicalForWrite,
                  category: ingredientCategory,
                  confidence: ingredientConfidence,
                })

                if (risk.blocked) {
                  const blockedCanonical = canonicalForWrite
                  const fallback = await resolveBlockedNewCanonicalFallback({
                    canonicalName: canonicalForWrite,
                  })

                  if (fallback) {
                    canonicalForWrite = fallback.canonicalName
                    ingredientCategory = fallback.category ?? ingredientCategory
                    existingCanonical = await standardizedIngredientsDB.findByCanonicalName(canonicalForWrite)
                    if (existingCanonical) {
                      console.warn(
                        `[QueueResolver] Recovered blocked canonical "${blockedCanonical}" -> "${canonicalForWrite}" ` +
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

              if (!existingCanonical) {
                const probationStats = await localProbationCache.track({
                  canonicalName: canonicalForWrite,
                  sourceSignature: buildCanonicalProbationSourceSignature(row, sourceSearchTerm),
                  source: row.source,
                  minDistinctSourcesForLongTtl: NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES,
                })

                if (
                  probationStats &&
                  probationStats.distinctSources < NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES
                ) {
                  throw new Error(
                    `Canonical probation hold for "${canonicalForWrite}" ` +
                      `(distinct_sources=${probationStats.distinctSources}, required=${NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES}, ` +
                      `total_events=${probationStats.totalEvents})`
                  )
                }
              }

              createdNewCanonical = !existingCanonical
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
                  isFoodItem: true,
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
                  isFoodItem: true,
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
            if (needsUnit && !skipUnitForNonFood && config.enableUnitResolution && unitResult?.status === "success") {
              const lowConfidenceNote = unitLowConfidence ? " [LOW CONFIDENCE]" : ""
              const fallbackNote = usedPackagedUnitFallback ? " [PACKAGED FALLBACK]" : ""
              console.log(
                `[QueueResolver] [DRY RUN] ${row.id} unit candidate -> ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit} ` +
                  `(confidence=${unitResult.confidence.toFixed(3)})${lowConfidenceNote}${fallbackNote}`
              )
            }
            if (needsIngredient) {
              const nonFoodNote = isFoodItem === false ? " [NON-FOOD]" : ""
              console.log(`[QueueResolver] [DRY RUN] ${row.id} -> ${canonicalForWrite}${nonFoodNote}`)
            }
          }

          if (
            !config.dryRun &&
            needsIngredient &&
            isFoodItem !== false &&
            rawIngredientConfidence !== null &&
            calibratedIngredientConfidence !== null
          ) {
            void ingredientMatchQueueDB
              .logIngredientConfidenceOutcome({
                rawConfidence: rawIngredientConfidence,
                calibratedConfidence: calibratedIngredientConfidence,
                outcome: "accepted",
                reason: createdNewCanonical ? "accepted_new_canonical" : "accepted_existing_canonical",
                category: ingredientCategory,
                canonicalName: canonicalForWrite,
                tokenCount:
                  confidenceTokenCount ??
                  normalizeCanonicalName(canonicalForWrite).split(" ").filter(Boolean).length,
                isNewCanonical: createdNewCanonical,
                source: row.source,
                resolver: config.resolverName,
                context: rowContext,
                metadata: {
                  row_id: row.id,
                },
              })
              .catch((error) => {
                console.warn("[QueueResolver] Failed to log accepted confidence outcome:", error)
              })
          }

          return {
            rowId: row.id,
            originalName: row.cleaned_name || row.raw_product_name || "",
            canonicalName: canonicalForWrite,
            isFoodItem,
            category: ingredientCategory,
            confidence: ingredientConfidence,
            resolvedUnit: unitResult?.status === "success" ? unitResult.resolvedUnit : null,
            resolvedQuantity: unitResult?.status === "success" ? unitResult.resolvedQuantity : null,
            unitConfidence: unitResult?.status === "success" ? unitResult.confidence : null,
            quantityConfidence: unitResult?.status === "success" ? unitResult.confidence : null,
            unitMetric:
              needsUnit && usedPackagedUnitFallback
                ? ("map_miss_then_fallback" as const)
                : needsUnit && unitResult?.status === "success"
                  ? ("unit_ai_success" as const)
                  : null,
          }
        } catch (error) {
          if (
            !config.dryRun &&
            needsIngredient &&
            isFoodItem !== false &&
            rawIngredientConfidence !== null &&
            calibratedIngredientConfidence !== null
          ) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            const semanticRejectReason = inferIngredientSemanticRejectReason(errorMessage)
            if (semanticRejectReason) {
              void ingredientMatchQueueDB
                .logIngredientConfidenceOutcome({
                  rawConfidence: rawIngredientConfidence,
                  calibratedConfidence: calibratedIngredientConfidence,
                  outcome: "rejected",
                  reason: semanticRejectReason,
                  category: ingredientCategory,
                  canonicalName: canonicalForWrite || null,
                  tokenCount:
                    confidenceTokenCount ??
                    normalizeCanonicalName(canonicalForWrite).split(" ").filter(Boolean).length,
                  isNewCanonical: createdNewCanonical,
                  source: row.source,
                  resolver: config.resolverName,
                  context: rowContext,
                  metadata: {
                    row_id: row.id,
                    error: errorMessage.slice(0, 500),
                  },
                })
                .catch((telemetryError) => {
                  console.warn("[QueueResolver] Failed to log rejected confidence outcome:", telemetryError)
                })
            }
          }
          throw error
        }
      })
    )

    let resolved = 0
    let failed = 0

    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        resolved += 1
        const unitMetric = result.value.unitMetric
        if (unitMetric === "map_miss_then_fallback") {
          unitMetrics.mapMissThenFallback += 1
        } else if (unitMetric === "unit_ai_success") {
          unitMetrics.aiSuccess += 1
        }
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
      if (row.needs_unit_review && isUnitResolutionError(errorMessage)) {
        unitMetrics.aiError += 1
      }
      if (!config.dryRun) {
        ingredientMatchQueueDB.markFailed(row.id, config.resolverName, errorMessage).catch(console.error)
      }
      if (config.dryRun && detailedResults) {
        detailedResults.push({
          rowId: row.id,
          originalName: row.cleaned_name || row.raw_product_name || "",
          canonicalName: "",
          isFoodItem: null,
          category: null,
          confidence: 0,
          status: "error",
          error: errorMessage,
        })
      }
    })

    return { resolved, failed: failed + (rows.length - validRows.length), unitMetrics, results: detailedResults }
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
    return { resolved: 0, failed: rows.length, unitMetrics, results: detailedResults }
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
  const totalUnitMetrics = emptyUnitMetrics()
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
    const cycleUnitMetrics = emptyUnitMetrics()

    for (const result of chunkResults) {
      cycleResolved += result.resolved
      cycleFailed += result.failed
      cycleUnitMetrics.mapMissThenFallback += result.unitMetrics.mapMissThenFallback
      cycleUnitMetrics.aiSuccess += result.unitMetrics.aiSuccess
      cycleUnitMetrics.aiError += result.unitMetrics.aiError
      if (config.dryRun && result.results && dryRunResults) {
        dryRunResults.push(...result.results)
      }
    }

    totalResolved += cycleResolved
    totalFailed += cycleFailed
    totalUnitMetrics.mapMissThenFallback += cycleUnitMetrics.mapMissThenFallback
    totalUnitMetrics.aiSuccess += cycleUnitMetrics.aiSuccess
    totalUnitMetrics.aiError += cycleUnitMetrics.aiError

    console.log(`[QueueResolver] ${mode} Cycle ${cycle} complete (resolved=${cycleResolved}, failed=${cycleFailed})`)
    console.log(
      `[QueueResolver] ${mode} Cycle ${cycle} unit metrics ` +
        `(unit_map_miss_then_fallback=${cycleUnitMetrics.mapMissThenFallback}, ` +
        `unit_ai_success=${cycleUnitMetrics.aiSuccess}, unit_ai_error=${cycleUnitMetrics.aiError})`
    )

    if (config.dryRun) {
      console.log(`[QueueResolver] ${mode} Dry run stopping after one cycle before clearing the rest of the queue.`)
      break
    }
  }

  if (cycle > 0) {
    console.log(
      `[QueueResolver] ${mode} Completed ${cycle} cycle(s) (total_resolved=${totalResolved}, total_failed=${totalFailed})`
    )
    console.log(
      `[QueueResolver] ${mode} Unit metrics total ` +
        `(unit_map_miss_then_fallback=${totalUnitMetrics.mapMissThenFallback}, ` +
        `unit_ai_success=${totalUnitMetrics.aiSuccess}, unit_ai_error=${totalUnitMetrics.aiError})`
    )
  }

  return {
    cycles: cycle,
    totalResolved,
    totalFailed,
    unitMetrics: totalUnitMetrics,
    dryRunResults,
  }
}
