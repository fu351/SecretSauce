import {
  ingredientMatchQueueDB,
  type IngredientMatchQueueRow,
  type IngredientMatchQueueUpdate,
} from "../../../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../../../lib/database/standardized-ingredients-db"
import {
  runStandardizerProcessor,
  getShadowProvider,
  type IngredientStandardizerContext,
  type IngredientStandardizationResult,
  type UnitStandardizationInput,
  type UnitStandardizationResult,
} from "../standardizer-worker"
import { writeShadowComparison } from "./shadow-writer"
import { normalizeConfidence } from "../../../lib/utils/number"
import { normalizeCanonicalName, singularizeCanonicalName } from "../../scripts/utils/canonical-matching"
import type { QueueWorkerConfig } from "../config"
import { chunkItems, mapWithConcurrency } from "./batching"
import { resolveCanonicalWithDoubleCheck } from "./canonical/double-check"
import {
  assessNewCanonicalRisk,
  NEW_CANONICAL_PROBATION_STALE_DAYS,
  isInvalidCanonicalName,
  resolveBlockedNewCanonicalFallback,
  stripRetailSuffixTokensFromCanonicalName,
} from "./canonical/risk"
import { getIngredientConfidenceCalibrator } from "./scoring/confidence-calibration"
import { getCanonicalTokenIdfScorer } from "./canonical/token-idf"
import { localProbationCache } from "./cache/probation-cache"
import {
  INGREDIENT_LOCAL_CACHE_VERSION,
  INGREDIENT_LOCAL_CACHE_MAX_AGE_DAYS,
  type IngredientLocalCachePayload,
  buildIngredientLocalCacheKey,
  toIngredientLocalCachePayload,
  fromIngredientLocalCachePayload,
} from "./ingredient-cache-utils"
import { localQueueAICache } from "./cache/local-ai-cache"
import { getLearnedVarietySensitivity, type LearnedVarietySensitivity } from "./scoring/sensitive-token-learning"
import {
  resolveVectorMatch,
  getEmbeddingModel,
  VECTOR_MATCH_HIGH_CONFIDENCE,
  SEMANTIC_DEDUP_THRESHOLD,
  PROTECTED_FORM_TOKENS,
} from "./scoring/vector-match"
import { resolveUnifiedIngredientCandidates } from "./candidates/resolve"
import {
  shouldUsePackagedUnitFallback,
  shouldUsePackagedUnitFallbackAfterFailure,
  buildPackagedUnitFallback,
  isPackagedUnitFallbackResult,
  UNIT_FALLBACK_CONFIDENCE,
  stripMeasurementFromSearchTerm,
} from "./unit-resolution-utils"
import {
  IngredientResolutionTelemetry,
  summarizeIngredientResolutionEvents,
  type IngredientResolutionEvent,
} from "../../../lib/observability/ingredient-resolution"

const NON_FOOD_TITLE_TOKENS = new Set([
  "balm",
  "body",
  "candle",
  "conditioner",
  "cosmetic",
  "deodorant",
  "dog",
  "face",
  "fragrance",
  "lotion",
  "lip",
  "makeup",
  "mask",
  "perfume",
  "pet",
  "shampoo",
  "skincare",
  "soap",
  "scented",
  "toothpaste",
  "toy",
  "treat",
  "treats",
  "cat",
  "litter",
])

const NON_FOOD_TITLE_PHRASES = [
  ["body", "butter"],
  ["body", "oil"],
  ["body", "wash"],
  ["face", "mask"],
  ["lip", "balm"],
  ["lip", "mask"],
  ["lip", "oil"],
  ["lip", "gloss"],
  ["pet", "treats"],
  ["dog", "treats"],
  ["cat", "treats"],
  ["dog", "food"],
  ["cat", "food"],
  ["tooth", "paste"],
]

interface ResolveBatchResult {
  resolved: number
  failed: number
  unitMetrics: UnitMetrics
  telemetryEvents: IngredientResolutionEvent[]
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

const LOG_SAMPLE_LIMIT = 3

function createRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// Keywords that reliably indicate a non-food product regardless of vector similarity.
// Used to gate the vector fast-path, which would otherwise accept e.g. "Coconut Body Butter"
// as food because it vector-matches "butter" at high confidence.
const NON_FOOD_KEYWORD_PATTERNS = [
  "body butter", "body oil", "body scrub", "body lotion",
  "lip balm", "lip mask", "lip butter",
  "face mask", "face wash", "face scrub",
  "hand soap", "foaming hand soap",
  "shampoo", "conditioner",
  "toothpaste", "mouthwash",
  "deodorant", "sunscreen",
  "castile soap",
  "dog treat", "dog food", "cat treat", "cat food", "pet food",
  "scented candle", "candle",
  "dish soap", "laundry",
  "paper towel", "toilet paper",
]

function likelyNonFoodByKeyword(name: string): boolean {
  const lower = name.toLowerCase()
  return NON_FOOD_KEYWORD_PATTERNS.some((kw) => lower.includes(kw))
}

function emptyUnitMetrics(): UnitMetrics {
  return {
    mapMissThenFallback: 0,
    aiSuccess: 0,
    aiError: 0,
  }
}

const NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES = 1

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

function hasNonFoodTitleSignals(sourceSearchTerm: string): boolean {
  const normalized = normalizeCanonicalName(sourceSearchTerm)
  if (!normalized) return false

  const tokens = normalized.split(" ").filter(Boolean)
  if (!tokens.length) return false

  const tokenSet = new Set(tokens)
  if (tokens.some((token) => NON_FOOD_TITLE_TOKENS.has(token))) {
    return true
  }

  return NON_FOOD_TITLE_PHRASES.some((phrase) => phrase.every((token) => tokenSet.has(token)))
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

function isCanonicalProbationHoldError(errorMessage: string): boolean {
  return errorMessage.toLowerCase().includes("canonical probation hold")
}

function formatSampleList(values: string[], limit = LOG_SAMPLE_LIMIT): string {
  if (!values.length) return ""
  const sample = values.slice(0, limit)
  const suffix = values.length > sample.length ? `, +${values.length - sample.length} more` : ""
  return `${sample.join(", ")}${suffix}`
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
  config: Pick<
    QueueWorkerConfig,
    "standardizerContext" | "recipeStandardizerContext" | "scraperStandardizerContext"
  >
): IngredientStandardizerContext {
  if (config.standardizerContext !== "dynamic") {
    return config.standardizerContext
  }

  if (row.source === "recipe") return config.recipeStandardizerContext
  return config.scraperStandardizerContext
}

export function maybeRetainFormSpecificCanonical(params: {
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

  if (missingFormTokens.some((token) => token === "chicken" || token === "beef" || token === "turkey" || token === "pork" || token === "lamb" || token === "veal" || token === "salmon" || token === "tuna" || token === "shrimp" || token === "fish" || token === "ham" || token === "bacon" || token === "sausage" || token === "steak" || token === "rib" || token === "ribs" || token === "duck" || token === "tofu" || token === "tempeh")) {
    return {
      canonicalName: sourceCanonical,
      reason: `protein_tail_retention(missing_forms=${missingFormTokens.join("|")})`,
    }
  }

  const sourceBaseTokens = sourceTokens.filter((token) => !PROTECTED_FORM_TOKENS.has(token))
  const sharedBaseTokens = sourceBaseTokens.filter((token) => modelTokens.has(token))
  if (!sharedBaseTokens.length) return null

  // If the source has significantly more tokens than the model output it is
  // likely a retail product title (brand name, size, marketing copy) rather
  // than a clean ingredient-form name. Returning it wholesale would write
  // garbage like "huy fong sriracha chili sauce hot 17oz" as a canonical.
  // Instead, construct a clean name by appending the missing form token(s)
  // to the model canonical — preserving the form signal without the noise.
  const retainedCanonical =
    sourceTokens.length <= modelTokens.size + 2
      ? sourceCanonical
      : [modelCanonical, ...missingFormTokens].join(" ")

  return {
    canonicalName: retainedCanonical,
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
  unitByRowId?: Map<string, UnitStandardizationResult>,
  telemetry?: IngredientResolutionTelemetry
): Promise<Map<string, IngredientStandardizationResult>> {
  const targetRows = rows.filter((row) => row.needs_ingredient_review)
  if (!targetRows.length) return new Map()

  const byRowId = new Map<string, IngredientStandardizationResult>()
  const rowsByContext = new Map<IngredientStandardizerContext, IngredientMatchQueueRow[]>()

  for (const row of targetRows) {
    const rowContext = resolveRowStandardizerContext(row, config)
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
    const queueRowIdByInputKey = new Map<string, string>()
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
      if (!queueRowIdByInputKey.has(dedupeKey)) {
        queueRowIdByInputKey.set(dedupeKey, row.id)
      }
      telemetry?.recordInput(row.id, dedupeKey, searchTerm, context)

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
        telemetry?.recordCache(input.id, true, cachedResult.canonicalName)
        cacheHitCount += 1
      } else {
        telemetry?.recordCache(input.id, false)
        aiInputs.push({ id: input.id, name: input.name })
      }
    }

    if (cacheHitCount > 0) {
      console.log(
        `[QueueResolver] Ingredient AI local cache hits ${cacheHitCount}/${uniqueInputs.length} for context=${context}`
      )
    }

    // Vector fast-path (Phase 3a): resolve high-confidence items without an LLM call.
    // For each AI-bound input, embed the search term and run a reranked cosine search.
    // Items whose final_score >= VECTOR_MATCH_HIGH_CONFIDENCE are injected directly into
    // aiResultByKey; the remainder proceed to the LLM as normal.
    //
    // Non-food guard: products containing personal-care, household, or pet keywords are
    // skipped here and fall through to the LLM, which correctly sets isFoodItem: false.
    // Without this guard, "Coconut Body Butter" vector-matches "butter" and gets accepted
    // as food because the fast-path unconditionally sets isFoodItem: true.
    if (!config.dryRun && aiInputs.length > 0) {
      const embeddingModel = getEmbeddingModel()
      const vectorFastPathHits: string[] = []
      const vectorFastPathNonFoodSkips: string[] = []

      for (let i = aiInputs.length - 1; i >= 0; i--) {
        const input = aiInputs[i]
        if (likelyNonFoodByKeyword(input.name)) {
          vectorFastPathNonFoodSkips.push(`"${input.name}"`)
          telemetry?.recordLikelyNonFoodVectorSkip(input.id)
          continue
        }
        try {
          const vectorMatch = await resolveVectorMatch(input.name, embeddingModel)
          if (vectorMatch && vectorMatch.finalScore >= VECTOR_MATCH_HIGH_CONFIDENCE) {
            aiResultByKey.set(input.id, {
              id: input.id,
              originalName: input.name,
              canonicalName: vectorMatch.matchedName,
              isFoodItem: true,
              category: vectorMatch.matchedCategory ?? null,
              confidence: vectorMatch.finalScore,
            })
            telemetry?.recordVectorFastPath(input.id, vectorMatch)
            aiInputs.splice(i, 1)
            vectorFastPathHits.push(`"${input.name}" → "${vectorMatch.matchedName}" (${vectorMatch.finalScore.toFixed(3)})`)
          }
        } catch (vectorError) {
          // Embedding unavailable: skip fast-path for this input, fall through to LLM.
          console.warn("[QueueResolver] vector_unavailable for fast-path:", (vectorError as Error).message)
        }
      }

      if (vectorFastPathHits.length > 0) {
        console.log(
          `[QueueResolver] Vector fast-path resolved ${vectorFastPathHits.length} item(s): ${vectorFastPathHits.join(", ")}`
        )
      }
      if (vectorFastPathNonFoodSkips.length > 0) {
        console.log(
          `[QueueResolver] Vector fast-path skipped ${vectorFastPathNonFoodSkips.length} likely-non-food item(s) (→ LLM): ${vectorFastPathNonFoodSkips.join(", ")}`
        )
      }
    }

    // Unified candidate augmentation (Phase 3): for remaining AI-bound inputs,
    // gather vector, fuzzy IDF, and MinHash candidates and attach the union as
    // suggestedCandidates in the prompt. Silently degrades on generator failure.
    const candidateHintsByKey = new Map<string, string[]>()
    if (!config.dryRun && aiInputs.length > 0) {
      const embeddingModel = getEmbeddingModel()
      let hintCount = 0
      for (const input of aiInputs) {
        try {
          const candidatePool = await resolveUnifiedIngredientCandidates({
            cleanedName: input.name,
            context,
            topK: 15,
            hintLimit: 20,
          })
          telemetry?.recordUnifiedCandidateHints(input.id, candidatePool.candidates, embeddingModel)
          if (candidatePool.hintNames.length > 0) {
            candidateHintsByKey.set(input.id, candidatePool.hintNames)
            hintCount++
          }
        } catch (error) {
          console.warn("[QueueResolver] unified candidates unavailable:", (error as Error).message)
          telemetry?.recordUnifiedCandidateHints(input.id, [], embeddingModel)
          // Silently skip — LLM will proceed without hints for this input
        }
      }
      if (hintCount > 0) {
        console.log(`[QueueResolver] Unified candidate augmentation: ${hintCount}/${aiInputs.length} input(s) have hints`)
      }
    }

    if (aiInputs.length > 0) {
      const aiInputsWithHints = candidateHintsByKey.size > 0
        ? aiInputs.map((input) => {
            const hints = candidateHintsByKey.get(input.id)
            return hints ? { ...input, vectorCandidates: hints } : input
          })
        : aiInputs
      const llmStartedAt = Date.now()
      const standardizerResult = await runStandardizerProcessor({
        mode: "ingredient",
        inputs: aiInputsWithHints,
        context,
      })
      const primaryLatencyMs = Date.now() - llmStartedAt
      telemetry?.recordLLMBatch(
        aiInputs.map((input) => input.id),
        context,
        primaryLatencyMs
      )
      const aiResults = standardizerResult.results
      for (const result of aiResults) {
        aiResultByKey.set(result.id, result)
        telemetry?.recordLLMResult(result.id, result)
      }

      const shadowProvider = getShadowProvider()
      if (shadowProvider && aiInputs.length > 0) {
        const shadowStartedAt = Date.now()
        shadowProvider
          .standardizeIngredients(aiInputsWithHints, { context })
          .then((shadowResults) => {
            const shadowById = new Map(shadowResults.map((r) => [r.id, r]))
            const comparisonWrites: Array<Promise<void>> = []
            for (const primaryResult of aiResults) {
              const input = inputById.get(primaryResult.id)
              const shadowResult = shadowById.get(primaryResult.id)
              if (!input) continue
              comparisonWrites.push(writeShadowComparison({
                inputKey: primaryResult.id,
                sourceName: input.name,
                primaryProvider: process.env.STANDARDIZER_PROVIDER ?? "openai",
                shadowProvider: shadowProvider.name,
                primaryCanonical: primaryResult.canonicalName,
                shadowCanonical: shadowResult?.canonicalName,
                primaryConfidence: primaryResult.confidence,
                shadowConfidence: shadowResult?.confidence,
                shadowStartedAt,
                primaryLatencyMs,
                canonicalAgreement: primaryResult.canonicalName === shadowResult?.canonicalName,
                categoryAgreement: primaryResult.category === shadowResult?.category,
                shadowError: shadowResult ? null : "missing_shadow_result",
                queueRowId: queueRowIdByInputKey.get(primaryResult.id) ?? null,
              }))
            }
            void Promise.allSettled(comparisonWrites)
          })
          .catch((err) => {
            const errorMessage = err instanceof Error ? err.message : String(err)
            process.stderr.write(`[shadow] ${errorMessage}\n`)
            const comparisonWrites: Array<Promise<void>> = []
            for (const primaryResult of aiResults) {
              const input = inputById.get(primaryResult.id)
              if (!input) continue
              comparisonWrites.push(writeShadowComparison({
                inputKey: primaryResult.id,
                sourceName: input.name,
                primaryProvider: process.env.STANDARDIZER_PROVIDER ?? "openai",
                shadowProvider: shadowProvider.name,
                primaryCanonical: primaryResult.canonicalName,
                shadowCanonical: undefined,
                primaryConfidence: primaryResult.confidence,
                shadowConfidence: undefined,
                shadowStartedAt,
                primaryLatencyMs,
                canonicalAgreement: false,
                categoryAgreement: false,
                shadowError: errorMessage,
                queueRowId: queueRowIdByInputKey.get(primaryResult.id) ?? null,
              }))
            }
            void Promise.allSettled(comparisonWrites)
          })
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

  const uniqueInputByKey = new Map<string, UnitStandardizationInput>()
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

  const standardizerResult = await runStandardizerProcessor({
    mode: "unit",
    inputs: Array.from(uniqueInputByKey.values()),
  })
  const aiResultByKey = new Map(standardizerResult.results.map((result) => [result.id, result]))
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

async function resolveBatch(
  rows: IngredientMatchQueueRow[],
  config: QueueWorkerConfig,
  runId: string
): Promise<ResolveBatchResult> {
  const detailedResults: ResolveBatchResult["results"] = config.dryRun ? [] : undefined
  const unitMetrics = emptyUnitMetrics()
  const telemetry = new IngredientResolutionTelemetry({
    rows,
    runId,
    resolver: config.resolverName,
  })
  const missingCategoryFallbackCanonicals = new Set<string>()
  const validRows = rows.filter((row) => {
    const searchTerm = getSearchTerm(row)
    if (!searchTerm) {
      const reason = "Row missing a canonicalizable ingredient name"
      console.warn(`[QueueResolver] Row ${row.id} ${reason}.`)
      telemetry.recordFailed(row.id, reason)
      if (!config.dryRun) {
        ingredientMatchQueueDB.markFailed(row.id, config.resolverName, reason).catch(console.error)
      }
      return false
    }
    return true
  })

  if (!validRows.length) {
    return { resolved: 0, failed: rows.length, unitMetrics, telemetryEvents: telemetry.completeEvents(), results: detailedResults }
  }

  let processableRows: IngredientMatchQueueRow[] = validRows
  let shortCircuitResolvedCount = 0
  const nonFoodShortCircuitRowIds = new Set<string>()

  try {
    const learnedVarietySensitivity = await getLearnedVarietySensitivity()
    const confidenceCalibrator = await getIngredientConfidenceCalibrator()
    const tokenIdfScorer = await getCanonicalTokenIdfScorer()
    // Non-food short-circuit: skip LLM for rows whose product_mapping_id was already
    // resolved as non-food in a prior queue run.
    const mappingIdsToCheck = validRows
      .filter((row) => row.needs_ingredient_review && row.product_mapping_id)
      .map((row) => row.product_mapping_id as string)
    const knownNonFoodMappingIds = mappingIdsToCheck.length
      ? await ingredientMatchQueueDB.fetchKnownNonFoodProductMappingIds(mappingIdsToCheck)
      : new Set<string>()

    const shortCircuitWritePromises: Promise<unknown>[] = []
    for (const row of validRows) {
      if (
        row.needs_ingredient_review &&
        row.product_mapping_id &&
        knownNonFoodMappingIds.has(row.product_mapping_id)
      ) {
        nonFoodShortCircuitRowIds.add(row.id)
        const shortCircuitCanonical =
          normalizeCanonicalName(row.best_fuzzy_match || row.cleaned_name || row.raw_product_name || "") ||
          "unknown"
        telemetry.recordNonFoodShortCircuit(row.id, shortCircuitCanonical)
        if (!config.dryRun) {
          shortCircuitWritePromises.push(
            ingredientMatchQueueDB.markResolved({
              rowId: row.id,
              canonicalName: shortCircuitCanonical,
              resolvedIngredientId: null,
              confidence: 0,
              resolver: config.resolverName,
              isFoodItem: false,
              clearIngredientReviewFlag: true,
              clearUnitReviewFlag: true,
            })
          )
        }
        console.log(
          `[QueueResolver]${config.dryRun ? " [DRY RUN]" : ""} ${row.id} non-food short-circuit ` +
            `(product_mapping_id=${row.product_mapping_id})`
        )
      }
    }
    if (shortCircuitWritePromises.length) {
      await Promise.allSettled(shortCircuitWritePromises)
    }

    shortCircuitResolvedCount = nonFoodShortCircuitRowIds.size
    processableRows = shortCircuitResolvedCount
      ? validRows.filter((row) => !nonFoodShortCircuitRowIds.has(row.id))
      : validRows

    const firstPassUnitByRowId = await resolveUnitCandidates(processableRows, undefined, config)
    const ingredientByRowId = await resolveIngredientCandidates(processableRows, config, firstPassUnitByRowId, telemetry)
    const unitByRowId = await rerunUnitCandidatesWithIngredientContext(
      processableRows,
      firstPassUnitByRowId,
      ingredientByRowId,
      config
    )

    const results = await Promise.allSettled(
      processableRows.map(async (row) => {
        const needsIngredient = row.needs_ingredient_review === true
        const needsUnit = row.needs_unit_review === true
        const rowContext = resolveRowStandardizerContext(row, config)
        let canonicalForWrite = getCanonicalFallback(row)
        let ingredientCategory: string | null = null
        let ingredientConfidence = normalizeConfidence(row.fuzzy_score, 0.5)
        let sourceSearchTerm = getSearchTerm(row)
        let isFoodItem: boolean | null = null
        let rawIngredientConfidence: number | null = null
        let calibratedIngredientConfidence: number | null = null
        let confidenceTokenCount: number | null = null
        let createdNewCanonical = false
        let titleNonFoodOverride = false
        let resolvedIngredientIdForTelemetry: string | null = null

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
            titleNonFoodOverride = hasNonFoodTitleSignals(sourceSearchTerm)
            isFoodItem = titleNonFoodOverride ? false : ingredientResult.isFoodItem !== false
            let normalizedCanonical = normalizeCanonicalName(ingredientResult.canonicalName)

            if (titleNonFoodOverride) {
              normalizedCanonical = normalizeCanonicalName(sourceSearchTerm)
              ingredientCategory = null
              telemetry.recordTitleNonFoodOverride(row.id, normalizedCanonical)
              console.log(
                `[QueueResolver] Non-food title override for "${normalizeCanonicalName(sourceSearchTerm)}" ` +
                  `(model_canonical="${normalizeCanonicalName(ingredientResult.canonicalName)}")`
              )
            }

            const formRetention = maybeRetainFormSpecificCanonical({
              sourceSearchTerm,
              modelCanonical: normalizedCanonical,
            })
            if (formRetention) {
              const originalCanonical = normalizedCanonical
              normalizedCanonical = formRetention.canonicalName
              telemetry.recordFormRetention(row.id, originalCanonical, normalizedCanonical, formRetention.reason)
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
              const originalCanonical = normalizedCanonical
              normalizedCanonical = varietyRetention.canonicalName
              telemetry.recordVarietyRetention(row.id, originalCanonical, normalizedCanonical, varietyRetention.reason)
              console.log(
                `[QueueResolver] Variety retention kept "${normalizeCanonicalName(sourceSearchTerm)}" ` +
                  `over model canonical "${normalizeCanonicalName(ingredientResult.canonicalName)}" ` +
                  `(${varietyRetention.reason})`
              )
            }

            const strippedRetailCanonical = stripRetailSuffixTokensFromCanonicalName(normalizedCanonical)
            if (strippedRetailCanonical) {
              telemetry.recordRetailStrip(row.id, normalizedCanonical, strippedRetailCanonical)
              console.log(
                `[QueueResolver] Stripped retail suffix "${normalizedCanonical}" -> "${strippedRetailCanonical}"`
              )
              normalizedCanonical = strippedRetailCanonical
            }

            if (!normalizedCanonical) {
              throw new Error("AI returned an empty canonical name")
            }

            if (isInvalidCanonicalName(normalizedCanonical)) {
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
                missingCategoryFallbackCanonicals.add(normalizedCanonical)
              }

              const confidenceCalibration = confidenceCalibrator.calibrate(rawIngredientConfidence)
              calibratedIngredientConfidence = confidenceCalibration.calibrated
              ingredientConfidence = calibratedIngredientConfidence
              telemetry.recordCalibration(
                row.id,
                rawIngredientConfidence,
                calibratedIngredientConfidence,
                confidenceCalibrator.totalSamples
              )

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
              telemetry.recordDoubleCheck(row.id, normalizedCanonical, canonicalForWrite)
              if (!canonicalForWrite) {
                throw new Error("Canonical name became empty after double-check")
              }
              if (isInvalidCanonicalName(canonicalForWrite)) {
                throw new Error(`Invalid canonical name "${canonicalForWrite}" returned after double-check`)
              }

              ingredientCategory = resolvedIngredientCategory
            } else {
              ingredientCategory = null
              calibratedIngredientConfidence = titleNonFoodOverride
                ? Math.min(rawIngredientConfidence, 0.12)
                : rawIngredientConfidence
              ingredientConfidence = calibratedIngredientConfidence
              canonicalForWrite = normalizedCanonical
              telemetry.recordCalibration(
                row.id,
                rawIngredientConfidence,
                calibratedIngredientConfidence,
                confidenceCalibrator.totalSamples
              )
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
                // Semantic dedup (Phase 3c): before entering risk-guard or probation,
                // embed the proposed canonical and check whether it is a near-duplicate
                // of an existing canonical.  If cosine rerank score >= SEMANTIC_DEDUP_THRESHOLD,
                // remap to that canonical — avoids vocabulary fragmentation without an LLM call.
                // Falls through silently on embedding failure so the risk-guard path is unchanged.
                try {
                  const embeddingModel = getEmbeddingModel()
                  const semanticMatch = await resolveVectorMatch(canonicalForWrite, embeddingModel, ingredientCategory)
                  if (semanticMatch && semanticMatch.finalScore >= SEMANTIC_DEDUP_THRESHOLD) {
                    const originalCanonical = canonicalForWrite
                    const remappedCanonical = semanticMatch.matchedName
                    existingCanonical = await standardizedIngredientsDB.findByCanonicalName(remappedCanonical)
                    if (existingCanonical) {
                      console.log(
                        `[QueueResolver] Semantic dedup remapped "${canonicalForWrite}" -> "${remappedCanonical}" ` +
                          `(score=${semanticMatch.finalScore.toFixed(3)})`
                      )
                      canonicalForWrite = remappedCanonical
                      ingredientCategory = semanticMatch.matchedCategory ?? ingredientCategory
                      telemetry.recordSemanticDedup(row.id, originalCanonical, remappedCanonical, semanticMatch)
                    }
                  }
                } catch (vectorError) {
                  console.warn("[QueueResolver] vector_unavailable for semantic dedup:", (vectorError as Error).message)
                }
              }

              if (!existingCanonical) {
                let risk = assessNewCanonicalRisk({
                  canonicalName: canonicalForWrite,
                  category: ingredientCategory,
                  confidence: ingredientConfidence,
                  tokenIdfScorer,
                })

                if (risk.blocked) {
                  const blockedCanonical = canonicalForWrite
                  const fallback = await resolveBlockedNewCanonicalFallback({
                    canonicalName: canonicalForWrite,
                    category: ingredientCategory,
                    confidence: ingredientConfidence,
                    tokenIdfScorer,
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
                    } else {
                      console.warn(
                        `[QueueResolver] Rewrote blocked canonical "${blockedCanonical}" -> "${canonicalForWrite}" ` +
                          `(source=${fallback.source}, block_reason=${risk.reason})`
                      )
                    }
                  }

                  if (!existingCanonical) {
                    risk = assessNewCanonicalRisk({
                      canonicalName: canonicalForWrite,
                      category: ingredientCategory,
                      confidence: ingredientConfidence,
                      tokenIdfScorer,
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

                const categorySpecific = ingredientCategory && ingredientCategory !== "other"
                const probationAgeMs = probationStats?.firstSeenAt
                  ? Date.now() - new Date(probationStats.firstSeenAt).getTime()
                  : 0
                const probationIsStale =
                  probationAgeMs >= NEW_CANONICAL_PROBATION_STALE_DAYS * 24 * 60 * 60 * 1000
                if (
                  probationStats &&
                  probationStats.distinctSources < NEW_CANONICAL_PROBATION_MIN_DISTINCT_SOURCES &&
                  !probationIsStale &&
                  !(categorySpecific && ingredientConfidence >= 0.65)
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
                existingCanonical ||
                (await standardizedIngredientsDB.getOrCreate(canonicalForWrite, ingredientCategory, true))
              if (!standardized?.id) {
                throw new Error("Failed to upsert standardized ingredient")
              }
              resolvedIngredientIdForTelemetry = standardized.id

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

          telemetry.recordResolved(row.id, {
            canonicalName: canonicalForWrite,
            canonicalId: resolvedIngredientIdForTelemetry,
            isFoodItem,
            confidence: ingredientConfidence,
          })

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

    let resolved = shortCircuitResolvedCount
    let failed = 0
    const failedByReason = new Map<string, { count: number; sampleRowIds: string[]; probationHold: boolean }>()

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
      const row = processableRows[idx]
      if (!row) return

      const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
      const isProbationHold = isCanonicalProbationHoldError(errorMessage)
      telemetry.recordFailed(row.id, errorMessage, isProbationHold)
      const existingFailure = failedByReason.get(errorMessage)
      if (!existingFailure) {
        failedByReason.set(errorMessage, {
          count: 1,
          sampleRowIds: [row.id],
          probationHold: isProbationHold,
        })
      } else {
        existingFailure.count += 1
        if (existingFailure.sampleRowIds.length < LOG_SAMPLE_LIMIT) {
          existingFailure.sampleRowIds.push(row.id)
        }
      }
      if (row.needs_unit_review && isUnitResolutionError(errorMessage)) {
        unitMetrics.aiError += 1
      }
      if (!config.dryRun) {
        const persistStatusPromise = isProbationHold
          ? ingredientMatchQueueDB.markProbation(row.id, config.resolverName, errorMessage)
          : ingredientMatchQueueDB.markFailed(row.id, config.resolverName, errorMessage)
        persistStatusPromise.catch(console.error)
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

    if (missingCategoryFallbackCanonicals.size > 0) {
      const fallbackCanonicals = Array.from(missingCategoryFallbackCanonicals).map((canonical) => `"${canonical}"`)
      console.warn(
        `[QueueResolver] Missing ingredient category fallback -> "other" for ` +
          `${missingCategoryFallbackCanonicals.size} canonical(s): ${formatSampleList(fallbackCanonicals)}`
      )
    }

    for (const [reason, summary] of failedByReason.entries()) {
      const logger = summary.probationHold ? console.warn : console.error
      const failureLabel = summary.probationHold ? "placed on probation" : "failed to resolve"
      logger(
        `[QueueResolver] ${summary.count} row(s) ${failureLabel} ` +
          `(sample_row_ids=${formatSampleList(summary.sampleRowIds)}): ${reason}`
      )
    }

    return {
      resolved,
      failed: failed + (rows.length - validRows.length),
      unitMetrics,
      telemetryEvents: telemetry.completeEvents(),
      results: detailedResults,
    }
  } catch (error) {
    console.error("[QueueResolver] Batch processing failed:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    for (const row of processableRows) {
      if (!nonFoodShortCircuitRowIds.has(row.id)) {
        telemetry.recordFailed(row.id, errorMessage)
      }
    }
    if (!config.dryRun) {
      await Promise.allSettled(
        processableRows.map((row) =>
          ingredientMatchQueueDB.markFailed(
            row.id,
            config.resolverName,
            errorMessage
          )
        )
      )
    }
    return {
      resolved: shortCircuitResolvedCount,
      failed: rows.length - shortCircuitResolvedCount,
      unitMetrics,
      telemetryEvents: telemetry.completeEvents(),
      results: detailedResults,
    }
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
  const modePrefix = mode ? `${mode} ` : ""
  console.log(`[QueueResolver] ${modePrefix}Starting run (limit ${config.batchLimit})`)
  console.log(
    `[QueueResolver] ${modePrefix}Canonical double-check: enabled ` +
      `(min_confidence=${config.doubleCheckMinConfidence}, min_similarity=${config.doubleCheckMinSimilarity})`
  )
  console.log(
    `[QueueResolver] ${modePrefix}Unit resolver: enabled=${config.enableUnitResolution}, ` +
      `unit_dry_run=${config.unitDryRun}, unit_min_confidence=${config.unitMinConfidence}`
  )

  let cycle = 0
  let totalResolved = 0
  let totalFailed = 0
  const totalUnitMetrics = emptyUnitMetrics()
  const dryRunResults: ResolveBatchResult["results"] = config.dryRun ? [] : undefined
  const runId = createRunId()
  const runStartedAt = Date.now()
  const runStartedAtIso = new Date(runStartedAt).toISOString()
  const allTelemetryEvents: IngredientResolutionEvent[] = []
  const queueDepthAtStart = config.dryRun ? null : await ingredientMatchQueueDB.fetchQueueDepth()

  if (!config.dryRun) {
    ingredientMatchQueueDB.snapshotQueueHealth().catch((error) => {
      console.warn("[QueueResolver] Failed to snapshot queue health at run start:", error)
    })
  }

  while (true) {
    if (config.maxCycles > 0 && cycle >= config.maxCycles) {
      console.log(`[QueueResolver] ${modePrefix}Reached max cycle limit (${config.maxCycles})`)
      break
    }

    if (!config.dryRun) {
      const requeued = await ingredientMatchQueueDB.requeueExpired(
        Math.max(config.batchLimit * 2, 100),
        "Lease expired before completion"
      )
      if (requeued > 0) {
        console.log(`[QueueResolver] ${modePrefix}Requeued ${requeued} expired processing row(s)`)
      }
    }

    console.log(`[QueueResolver] ${modePrefix}Fetch cycle ${cycle + 1} (limit ${config.batchLimit})`)
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
        console.log(`[QueueResolver] ${modePrefix}No pending matches`)
      } else {
        console.log(`[QueueResolver] ${modePrefix}Queue drained after ${cycle} cycle(s)`)
      }
      break
    }

    cycle += 1

    const chunks = chunkItems(pending, config.chunkSize)
    console.log(
      `[QueueResolver] ${modePrefix}Processing ${pending.length} items in ` +
        `${chunks.length} chunk(s), concurrency=${config.chunkConcurrency}`
    )

    const chunkResults = await mapWithConcurrency(chunks, config.chunkConcurrency, async (chunk, index) => {
      console.log(
        `[QueueResolver] ${modePrefix}Processing chunk ${index + 1}/${chunks.length} (${chunk.length} items)`
      )
      const result = await resolveBatch(chunk, config, runId)
      console.log(
        `[QueueResolver] ${modePrefix}Chunk ${index + 1} complete ` +
          `(resolved=${result.resolved}, failed=${result.failed})`
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
      allTelemetryEvents.push(...result.telemetryEvents)
      if (config.dryRun && result.results && dryRunResults) {
        dryRunResults.push(...result.results)
      }
    }

    totalResolved += cycleResolved
    totalFailed += cycleFailed
    totalUnitMetrics.mapMissThenFallback += cycleUnitMetrics.mapMissThenFallback
    totalUnitMetrics.aiSuccess += cycleUnitMetrics.aiSuccess
    totalUnitMetrics.aiError += cycleUnitMetrics.aiError

    console.log(
      `[QueueResolver] ${modePrefix}Cycle ${cycle} complete (resolved=${cycleResolved}, failed=${cycleFailed})`
    )
    console.log(
      `[QueueResolver] ${modePrefix}Cycle ${cycle} unit metrics ` +
        `(unit_map_miss_then_fallback=${cycleUnitMetrics.mapMissThenFallback}, ` +
        `unit_ai_success=${cycleUnitMetrics.aiSuccess}, unit_ai_error=${cycleUnitMetrics.aiError})`
    )

    if (config.dryRun) {
      console.log(
        `[QueueResolver] ${modePrefix}Dry run stopping after one cycle before clearing the rest of the queue.`
      )
      break
    }
  }

  if (cycle > 0) {
    console.log(
      `[QueueResolver] ${modePrefix}Completed ${cycle} cycle(s) ` +
        `(total_resolved=${totalResolved}, total_failed=${totalFailed})`
    )
    console.log(
      `[QueueResolver] ${modePrefix}Unit metrics total ` +
        `(unit_map_miss_then_fallback=${totalUnitMetrics.mapMissThenFallback}, ` +
        `unit_ai_success=${totalUnitMetrics.aiSuccess}, unit_ai_error=${totalUnitMetrics.aiError})`
    )
  }

  if (allTelemetryEvents.length > 0) {
    for (const event of allTelemetryEvents) {
      process.stdout.write(JSON.stringify({ _type: "ingredient_resolution_event", ...event }) + "\n")
    }

    if (!config.dryRun) {
      const wroteLogs = await ingredientMatchQueueDB.insertIngredientResolutionLogs(allTelemetryEvents)
      if (!wroteLogs) {
        console.warn("[QueueResolver] Failed to persist ingredient resolution observability logs")
      }
    }
  }

  if (!config.dryRun) {
    const queueDepthAtEnd = await ingredientMatchQueueDB.fetchQueueDepth()
    ingredientMatchQueueDB.snapshotQueueHealth().catch((error) => {
      console.warn("[QueueResolver] Failed to snapshot queue health at run end:", error)
    })

    if (cycle > 0) {
      const obsSummary = summarizeIngredientResolutionEvents(allTelemetryEvents)
      await ingredientMatchQueueDB.insertIngredientWorkerRunLog({
        runId,
        resolver: config.resolverName,
        ...obsSummary,
        queueDepthAtStart,
        queueDepthAtEnd,
        runDurationMs: Date.now() - runStartedAt,
        startedAt: runStartedAtIso,
      })
    }
  }

  return {
    cycles: cycle,
    totalResolved,
    totalFailed,
    unitMetrics: totalUnitMetrics,
    dryRunResults,
  }
}
