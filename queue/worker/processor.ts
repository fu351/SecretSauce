import { ingredientMatchQueueDB, type IngredientMatchQueueRow } from "../../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../../lib/database/standardized-ingredients-db"
import { standardizeIngredientsWithAI } from "../../lib/ingredient-standardizer"
import type { QueueWorkerConfig } from "../config"
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

  if (collected.size === 0) {
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

async function resolveBatch(rows: IngredientMatchQueueRow[], config: QueueWorkerConfig): Promise<ResolveBatchResult> {
  const detailedResults: ResolveBatchResult["results"] = config.dryRun ? [] : undefined

  const validRows = rows.filter((row) => {
    const searchTerm = (row.cleaned_name || row.raw_product_name || "").trim()
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

  if (validRows.length === 0) {
    return { resolved: 0, failed: rows.length, results: detailedResults }
  }

  try {
    const uniqueInputByKey = new Map<string, { id: string; name: string }>()
    const rowToInputKey = new Map<string, string>()

    for (const row of validRows) {
      const searchTerm = (row.cleaned_name || row.raw_product_name || "").trim()
      const dedupeKey = searchTerm.toLowerCase()

      if (!uniqueInputByKey.has(dedupeKey)) {
        uniqueInputByKey.set(dedupeKey, { id: dedupeKey, name: searchTerm })
      }

      rowToInputKey.set(row.id, dedupeKey)
    }

    const aiResults = await standardizeIngredientsWithAI(
      Array.from(uniqueInputByKey.values()),
      config.standardizerContext
    )
    const aiResultByKey = new Map(aiResults.map((result) => [result.id, result]))

    const results = await Promise.allSettled(
      validRows.map(async (row) => {
        const inputKey = rowToInputKey.get(row.id)
        if (!inputKey) {
          throw new Error("Queue row missing dedupe key")
        }

        const result = aiResultByKey.get(inputKey)
        if (!result || !result.canonicalName) {
          throw new Error("AI returned no canonical name")
        }

        const normalizedCanonical = normalizeCanonicalName(result.canonicalName)
        if (!normalizedCanonical) {
          throw new Error("AI returned an empty canonical name")
        }

        if (result.confidence < 0.3 && !result.category) {
          throw new Error(`Non-food item detected: "${normalizedCanonical}" (confidence: ${result.confidence})`)
        }

        const canonicalForWrite = await resolveCanonicalWithDoubleCheck(
          normalizedCanonical,
          result.category,
          result.confidence,
          config
        )

        if (!canonicalForWrite) {
          throw new Error("Canonical name became empty after double-check")
        }

        if (!config.dryRun) {
          const standardized = await standardizedIngredientsDB.getOrCreate(canonicalForWrite, result.category)
          if (!standardized?.id) {
            throw new Error("Failed to upsert standardized ingredient")
          }

          const success = row.needs_unit_review
            ? await ingredientMatchQueueDB.markIngredientResolvedPendingUnit({
                rowId: row.id,
                canonicalName: canonicalForWrite,
                resolvedIngredientId: standardized.id,
                confidence: result.confidence,
                resolver: config.resolverName,
              })
            : await ingredientMatchQueueDB.markResolved({
                rowId: row.id,
                canonicalName: canonicalForWrite,
                resolvedIngredientId: standardized.id,
                confidence: result.confidence,
                resolver: config.resolverName,
                // Unit resolver pass can provide resolvedUnit/resolvedQuantity and
                // unitConfidence/quantityConfidence via this same write path.
                clearIngredientReviewFlag: true,
                clearUnitReviewFlag: true,
              })

          if (!success) {
            throw new Error("Failed to persist queue resolution status")
          }

          if (row.needs_unit_review) {
            console.log(
              `[QueueResolver] ${row.id} ingredient resolved (${standardized.id}); left pending for unit review`
            )
          } else {
            console.log(`[QueueResolver] ${row.id} -> ${canonicalForWrite} (${standardized.id})`)
          }
        } else {
          console.log(`[QueueResolver] [DRY RUN] ${row.id} -> ${canonicalForWrite}`)
        }

        return {
          rowId: row.id,
          originalName: row.cleaned_name || row.raw_product_name || "",
          canonicalName: canonicalForWrite,
          category: result.category || null,
          confidence: result.confidence,
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
  if (config.reviewMode === "unit") {
    throw new Error("QUEUE_REVIEW_MODE=unit is not implemented yet. Use ingredient or any until the unit resolver is added.")
  }

  const mode = config.dryRun ? "[DRY RUN]" : ""
  console.log(`[QueueResolver] ${mode} Starting run (limit ${config.batchLimit})`)
  console.log(
    `[QueueResolver] ${mode} Canonical double-check: enabled (min_confidence=${config.doubleCheckMinConfidence}, min_similarity=${config.doubleCheckMinSimilarity})`
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
