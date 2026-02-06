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
const standardizerContext = process.env.QUEUE_STANDARDIZER_CONTEXT === "recipe" ? "recipe" : "pantry"

async function resolveRow(row: IngredientMatchQueueRow): Promise<boolean> {
  const searchTerm = (row.cleaned_name || row.raw_product_name || "").trim()
  if (!searchTerm) {
    console.warn(`[QueueResolver] Row ${row.id} missing a name. Marking as failed.`)
    await ingredientMatchQueueDB.markFailed(row.id, resolverName)
    return false
  }

  try {
    const aiResults = await standardizeIngredientsWithAI(
      [
        {
          id: row.id,
          name: searchTerm,
        },
      ],
      standardizerContext,
    )

    const result = aiResults[0]
    if (!result || !result.canonicalName) {
      throw new Error("AI returned no canonical name")
    }

    const normalizedCanonical = result.canonicalName.trim().toLowerCase()
    if (!normalizedCanonical) {
      throw new Error("AI returned an empty canonical name")
    }

    const standardized = await standardizedIngredientsDB.getOrCreate(normalizedCanonical, result.category)
    if (!standardized?.id) {
      throw new Error("Failed to upsert standardized ingredient")
    }

    const success = await ingredientMatchQueueDB.markResolved({
      rowId: row.id,
      canonicalName: normalizedCanonical,
      resolvedIngredientId: standardized.id,
      confidence: result.confidence,
      resolver: resolverName,
    })

    if (!success) {
      throw new Error("Failed to mark queue row as resolved")
    }

    console.log(`[QueueResolver] ${row.id} → ${normalizedCanonical} (${standardized.id})`)
    return true
  } catch (error) {
    console.error(`[QueueResolver] ${row.id} failed to resolve:`, error)
    await ingredientMatchQueueDB.markFailed(row.id, resolverName)
    return false
  }
}

async function run(): Promise<void> {
  console.log(`[QueueResolver] Starting nightly run (limit ${batchLimit})`)

  const pending = await ingredientMatchQueueDB.fetchPending(batchLimit)
  if (!pending.length) {
    console.log("[QueueResolver] No pending matches")
    return
  }

  const claimed = await ingredientMatchQueueDB.markProcessing(pending.map((row) => row.id), resolverName)
  if (!claimed) {
    console.error("[QueueResolver] Failed to mark pending rows as processing. Aborting run.")
    return
  }

  let resolved = 0
  let failed = 0

  for (const row of pending) {
    const success = await resolveRow(row)
    if (success) {
      resolved += 1
    } else {
      failed += 1
    }
  }

  console.log(`[QueueResolver] Completed (resolved=${resolved}, failed=${failed})`)
}

run().catch((error) => {
  console.error("[QueueResolver] Unhandled error:", error)
  process.exit(1)
})
