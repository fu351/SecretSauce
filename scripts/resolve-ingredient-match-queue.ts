#!/usr/bin/env tsx

import { ingredientMatchQueueDB, type IngredientMatchQueueRow } from "../lib/database/ingredient-match-queue-db"
import { standardizedIngredientsDB } from "../lib/database/standardized-ingredients-db"
import { standardizeIngredientsWithAI } from "../lib/ingredient-standardizer"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before running the resolver.")
  process.exit(1)
}

if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
  console.error("GEMINI_API_KEY (or OPENAI_API_KEY) is required to standardize ingredients.")
  process.exit(1)
}

const resolverName = process.env.QUEUE_RESOLVER_NAME || "nightly-gemini"
const requestedBatchLimit = Number(process.env.QUEUE_BATCH_LIMIT ?? 25)
const batchLimit = Number.isFinite(requestedBatchLimit) && requestedBatchLimit > 0 ? Math.floor(requestedBatchLimit) : 25
const requestedMaxCycles = Number(process.env.QUEUE_MAX_CYCLES ?? 0)
const maxCycles = Number.isFinite(requestedMaxCycles) && requestedMaxCycles > 0 ? Math.floor(requestedMaxCycles) : 0
const standardizerContext = process.env.QUEUE_STANDARDIZER_CONTEXT === "recipe" ? "recipe" : "pantry"
const dryRun = process.env.DRY_RUN === "true"
const requestedDoubleCheckMinConfidence = Number(process.env.LLM_DOUBLE_CHECK_MIN_CONFIDENCE ?? 0.85)
const doubleCheckMinConfidence =
  Number.isFinite(requestedDoubleCheckMinConfidence) &&
  requestedDoubleCheckMinConfidence >= 0 &&
  requestedDoubleCheckMinConfidence <= 1
    ? requestedDoubleCheckMinConfidence
    : 0.85
const requestedDoubleCheckMinSimilarity = Number(process.env.LLM_DOUBLE_CHECK_MIN_SIMILARITY ?? 0.96)
const doubleCheckMinSimilarity =
  Number.isFinite(requestedDoubleCheckMinSimilarity) &&
  requestedDoubleCheckMinSimilarity >= 0 &&
  requestedDoubleCheckMinSimilarity <= 1
    ? requestedDoubleCheckMinSimilarity
    : 0.96

interface CanonicalCandidate {
  canonicalName: string
  category: string | null
}

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

function normalizeCanonicalName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function singularizeWord(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2)
  if (word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches") || word.endsWith("xes") || word.endsWith("zes")) {
    return word.slice(0, -2)
  }
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

function singularizeCanonicalName(value: string): string {
  return normalizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeWord)
    .join(" ")
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeCanonicalName(value)
      .split(" ")
      .filter(Boolean)
  )
}

function tokenJaccard(a: string, b: string): number {
  const aTokens = tokenSet(a)
  const bTokens = tokenSet(b)
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1
  }
  const union = aTokens.size + bTokens.size - intersection
  return union === 0 ? 0 : intersection / union
}

function bigramSet(value: string): Set<string> {
  const normalized = normalizeCanonicalName(value).replace(/\s/g, "")
  if (normalized.length < 2) return new Set([normalized])

  const output = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index += 1) {
    output.add(normalized.slice(index, index + 2))
  }
  return output
}

function diceSimilarity(a: string, b: string): number {
  const aBigrams = bigramSet(a)
  const bBigrams = bigramSet(b)
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0

  let overlap = 0
  for (const bg of aBigrams) {
    if (bBigrams.has(bg)) overlap += 1
  }
  return (2 * overlap) / (aBigrams.size + bBigrams.size)
}

function scoreCanonicalSimilarity(candidate: string, existing: string): number {
  const normalizedCandidate = normalizeCanonicalName(candidate)
  const normalizedExisting = normalizeCanonicalName(existing)
  if (!normalizedCandidate || !normalizedExisting) return 0
  if (normalizedCandidate === normalizedExisting) return 1

  const singularCandidate = singularizeCanonicalName(normalizedCandidate)
  const singularExisting = singularizeCanonicalName(normalizedExisting)
  if (singularCandidate === singularExisting) return 0.995

  const tokenScore = tokenJaccard(normalizedCandidate, normalizedExisting)
  const charScore = diceSimilarity(normalizedCandidate, normalizedExisting)
  return (tokenScore * 0.45) + (charScore * 0.55)
}

async function resolveCanonicalWithDoubleCheck(
  canonicalName: string,
  category: string | null | undefined,
  confidence: number
): Promise<string> {
  const normalizedCanonical = normalizeCanonicalName(canonicalName)
  if (!normalizedCanonical) return ""

  if (confidence < doubleCheckMinConfidence) {
    return normalizedCanonical
  }

  const exact = await standardizedIngredientsDB.findByCanonicalName(normalizedCanonical)
  if (exact?.canonical_name) {
    return exact.canonical_name
  }

  const singular = singularizeCanonicalName(normalizedCanonical)
  const queryTerms = Array.from(new Set([normalizedCanonical, singular].filter(Boolean)))
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

  if (bestMatch && bestScore >= doubleCheckMinSimilarity) {
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

async function resolveBatch(rows: IngredientMatchQueueRow[]): Promise<ResolveBatchResult> {
  // Filter out rows without names
  const validRows = rows.filter((row) => {
    const searchTerm = (row.cleaned_name || row.raw_product_name || "").trim()
    if (!searchTerm) {
      console.warn(`[QueueResolver] Row ${row.id} missing a name. Marking as failed.`)
      if (!dryRun) {
        ingredientMatchQueueDB.markFailed(row.id, resolverName).catch(console.error)
      }
      return false
    }
    return true
  })

  if (validRows.length === 0) {
    return { resolved: 0, failed: rows.length, results: dryRun ? [] : undefined }
  }

  try {
    // Batch AI call for all valid rows
    const aiInput = validRows.map((row) => ({
      id: row.id,
      name: (row.cleaned_name || row.raw_product_name || "").trim(),
    }))

    const aiResults = await standardizeIngredientsWithAI(aiInput, standardizerContext)

    // Process results
    const results = await Promise.allSettled(
      aiResults.map(async (result, idx) => {
        const row = validRows[idx]
        if (!row) {
          throw new Error(`No row found for result index ${idx}`)
        }

        if (!result || !result.canonicalName) {
          throw new Error("AI returned no canonical name")
        }

        const normalizedCanonical = normalizeCanonicalName(result.canonicalName)
        if (!normalizedCanonical) {
          throw new Error("AI returned an empty canonical name")
        }

        // Reject non-food items (low confidence and no category)
        if (result.confidence < 0.3 && !result.category) {
          throw new Error(`Non-food item detected: "${normalizedCanonical}" (confidence: ${result.confidence})`)
        }

        // In dry run, skip database operations
        let standardizedId: string | undefined
        const canonicalForWrite = await resolveCanonicalWithDoubleCheck(
          normalizedCanonical,
          result.category,
          result.confidence
        )

        if (!canonicalForWrite) {
          throw new Error("Canonical name became empty after double-check")
        }

        if (!dryRun) {
          const standardized = await standardizedIngredientsDB.getOrCreate(canonicalForWrite, result.category)
          if (!standardized?.id) {
            throw new Error("Failed to upsert standardized ingredient")
          }
          standardizedId = standardized.id

          const success = await ingredientMatchQueueDB.markResolved({
            rowId: row.id,
            canonicalName: canonicalForWrite,
            resolvedIngredientId: standardized.id,
            confidence: result.confidence,
            resolver: resolverName,
          })

          if (!success) {
            throw new Error("Failed to mark queue row as resolved")
          }

          console.log(`[QueueResolver] ${row.id} → ${canonicalForWrite} (${standardized.id})`)
        } else {
          console.log(`[QueueResolver] [DRY RUN] ${row.id} → ${canonicalForWrite}`)
        }

        return {
          rowId: row.id,
          originalName: row.cleaned_name || row.raw_product_name || "",
          canonicalName: canonicalForWrite,
          category: result.category || null,
          confidence: result.confidence,
          standardizedId,
        }
      })
    )

    // Count successes and failures
    let resolved = 0
    let failed = 0
    const detailedResults: ResolveBatchResult["results"] = dryRun ? [] : undefined

    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        resolved += 1
        if (dryRun && detailedResults) {
          detailedResults.push({
            ...result.value,
            status: "success",
          })
        }
      } else {
        failed += 1
        const row = validRows[idx]
        if (row) {
          console.error(`[QueueResolver] ${row.id} failed to resolve:`, result.reason)
          if (!dryRun) {
            ingredientMatchQueueDB.markFailed(row.id, resolverName).catch(console.error)
          }
          if (dryRun && detailedResults) {
            detailedResults.push({
              rowId: row.id,
              originalName: row.cleaned_name || row.raw_product_name || "",
              canonicalName: "",
              category: null,
              confidence: 0,
              status: "error",
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            })
          }
        }
      }
    })

    return { resolved, failed: failed + (rows.length - validRows.length), results: detailedResults }
  } catch (error) {
    console.error(`[QueueResolver] Batch processing failed:`, error)
    // Mark all rows as failed (skip in dry run)
    if (!dryRun) {
      await Promise.allSettled(
        validRows.map((row) => ingredientMatchQueueDB.markFailed(row.id, resolverName))
      )
    }
    return { resolved: 0, failed: rows.length, results: dryRun ? [] : undefined }
  }
}

async function run(): Promise<void> {
  const mode = dryRun ? "[DRY RUN]" : ""
  console.log(`[QueueResolver] ${mode} Starting run (limit ${batchLimit})`)
  console.log(
    `[QueueResolver] ${mode} Canonical double-check: enabled (min_confidence=${doubleCheckMinConfidence}, min_similarity=${doubleCheckMinSimilarity})`
  )

  let cycle = 0
  let totalResolved = 0
  let totalFailed = 0
  const allResults: any[] = []

  while (true) {
    if (maxCycles > 0 && cycle >= maxCycles) {
      console.log(`[QueueResolver] ${mode} Reached max cycle limit (${maxCycles})`)
      break
    }

    console.log(`[QueueResolver] ${mode} Fetch cycle ${cycle + 1} (limit ${batchLimit})`)
    const pending = await ingredientMatchQueueDB.fetchPending(batchLimit)

    if (!pending.length) {
      if (cycle === 0) {
        console.log(`[QueueResolver] ${mode} No pending matches`)
      } else {
        console.log(`[QueueResolver] ${mode} Queue drained after ${cycle} cycle(s)`)
      }
      break
    }

    cycle += 1

    const chunkSize = 10
    const chunks: IngredientMatchQueueRow[][] = []
    const itemsToProcess = dryRun ? pending.slice(0, chunkSize) : pending

    for (let i = 0; i < itemsToProcess.length; i += chunkSize) {
      chunks.push(itemsToProcess.slice(i, i + chunkSize))
    }

    console.log(`[QueueResolver] ${mode} Processing ${itemsToProcess.length} items in ${chunks.length} chunks of ${chunkSize}`)

    let cycleResolved = 0
    let cycleFailed = 0

    for (const [idx, chunk] of chunks.entries()) {
      console.log(`[QueueResolver] ${mode} Processing chunk ${idx + 1}/${chunks.length} (${chunk.length} items)`)

      // Skip marking as processing in dry run
      if (!dryRun) {
        const claimed = await ingredientMatchQueueDB.markProcessing(chunk.map((row) => row.id), resolverName)
        if (!claimed) {
          console.error(`[QueueResolver] Failed to mark chunk ${idx + 1} as processing. Skipping.`)
          cycleFailed += chunk.length
          continue
        }
      }

      const { resolved, failed, results } = await resolveBatch(chunk)
      cycleResolved += resolved
      cycleFailed += failed

      if (dryRun && results) {
        allResults.push(...results)
      }

      console.log(`[QueueResolver] ${mode} Chunk ${idx + 1} complete (resolved=${resolved}, failed=${failed})`)
    }

    totalResolved += cycleResolved
    totalFailed += cycleFailed

    console.log(`[QueueResolver] ${mode} Cycle ${cycle} complete (resolved=${cycleResolved}, failed=${cycleFailed})`)

    if (dryRun) {
      console.log(`[QueueResolver] ${mode} Dry run stopping after one cycle before clearing the rest of the queue.`)
      break
    }
  }

  if (cycle > 0) {
    console.log(`[QueueResolver] ${mode} Completed ${cycle} cycle(s) (total_resolved=${totalResolved}, total_failed=${totalFailed})`)
  }

  if (dryRun && cycle > 0) {
    console.log("\n========== DRY RUN RESULTS ==========")
    console.log(JSON.stringify({
      summary: {
        totalProcessed: totalResolved + totalFailed,
        resolved: totalResolved,
        failed: totalFailed,
      },
      results: allResults,
    }, null, 2))
    console.log("=====================================\n")
  }
}

run().catch((error) => {
  console.error("[QueueResolver] Unhandled error:", error)
  process.exit(1)
})
