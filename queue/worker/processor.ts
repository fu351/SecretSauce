import { ingredientMatchQueueDB, type IngredientMatchQueueRow } from "../../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../../lib/database/standardized-ingredients-db"
import { standardizeIngredientsWithAI, type IngredientStandardizationResult } from "../../lib/ingredient-standardizer"
import { standardizeUnitsWithAI, type UnitStandardizationResult } from "../../lib/unit-standardizer"
import type { QueueWorkerConfig } from "../config"
import type { IngredientStandardizerContext } from "../../lib/utils/ingredient-standardizer-context"
import { chunkItems, mapWithConcurrency } from "./batching"
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

  const queryTerms = buildCanonicalQueryTerms(normalizedCanonical)
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
      score -= 0.05
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  if (bestMatch && bestScore >= config.doubleCheckMinSimilarity) {
    if (bestMatch.canonicalName !== normalizedCanonical) {
      console.log(
        `[QueueResolver] High-confidence canonical double-check remapped "${normalizedCanonical}" -> "${bestMatch.canonicalName}" ` +
          `(ai_confidence=${confidence.toFixed(2)}, similarity=${bestScore.toFixed(3)})`
      )
    }
    return bestMatch.canonicalName
  }

  return normalizedCanonical
}

async function resolveIngredientCandidates(
  rows: IngredientMatchQueueRow[],
  config: QueueWorkerConfig
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
    const uniqueInputByKey = new Map<string, { id: string; name: string }>()
    const rowToInputKey = new Map<string, string>()

    for (const row of contextRows) {
      const searchTerm = getSearchTerm(row)
      const dedupeKey = searchTerm.toLowerCase()

      if (!uniqueInputByKey.has(dedupeKey)) {
        uniqueInputByKey.set(dedupeKey, { id: dedupeKey, name: searchTerm })
      }

      rowToInputKey.set(row.id, dedupeKey)
    }

    const aiResults = await standardizeIngredientsWithAI(Array.from(uniqueInputByKey.values()), context)
    const aiResultByKey = new Map(aiResults.map((result) => [result.id, result]))

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
  ingredientByRowId: Map<string, IngredientStandardizationResult>,
  config: QueueWorkerConfig
): Promise<Map<string, UnitStandardizationResult>> {
  if (!config.enableUnitResolution) return new Map()

  const targetRows = rows.filter((row) => row.needs_unit_review)
  if (!targetRows.length) return new Map()

  const uniqueInputByKey = new Map<string, Parameters<typeof standardizeUnitsWithAI>[0][number]>()
  const rowToInputKey = new Map<string, string>()

  for (const row of targetRows) {
    const ingredientCanonical =
      ingredientByRowId.get(row.id)?.canonicalName ?? row.best_fuzzy_match ?? undefined
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

  const byRowId = new Map<string, UnitStandardizationResult>()
  for (const row of targetRows) {
    const inputKey = rowToInputKey.get(row.id)
    if (!inputKey) continue
    const result = aiResultByKey.get(inputKey)
    if (result) {
      byRowId.set(row.id, result)
    }
  }

  return byRowId
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
    const ingredientByRowId = await resolveIngredientCandidates(validRows, config)
    const unitByRowId = await resolveUnitCandidates(validRows, ingredientByRowId, config)

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
          if (unitResult.confidence < config.unitMinConfidence) {
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
            const standardized = await standardizedIngredientsDB.getOrCreate(canonicalForWrite, ingredientCategory)
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
                `[QueueResolver] ${row.id} -> ${canonicalForWrite} (${standardized.id}) + unit ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit}`
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
              `[QueueResolver] ${row.id} unit resolved -> ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit}`
            )
          } else if (needsUnit && config.enableUnitResolution && config.unitDryRun) {
            throw new Error("Unit dry run cannot be used for unit-only rows")
          } else if (needsUnit) {
            throw new Error("Unit resolution is disabled for a unit-review row")
          }
        } else {
          if (needsUnit && config.enableUnitResolution && unitResult?.status === "success") {
            const lowConfidenceNote = unitLowConfidence ? " [LOW CONFIDENCE]" : ""
            console.log(
              `[QueueResolver] [DRY RUN] ${row.id} unit candidate -> ${unitResult.resolvedQuantity} ${unitResult.resolvedUnit} ` +
                `(confidence=${unitResult.confidence.toFixed(3)})${lowConfidenceNote}`
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
    console.error(`[QueueResolver] Batch processing failed:`, error)
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
