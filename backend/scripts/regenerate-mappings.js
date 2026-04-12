#!/usr/bin/env node

/**
 * Regenerate mappings by calling Supabase relink RPCs in batches.
 *
 * Required env:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * Optional env:
 * - RUN_RECIPE_RELINK=true|false (default: true)
 * - RUN_PRODUCT_RELINK=true|false (default: true)
 * - RESET_ALL=true|false (default: false)
 * - RELINK_BATCH_SIZE=500
 * - RELINK_MAX_BATCHES=200
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function readBoolean(value, fallback) {
  if (value == null) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (normalized === "true") return true
  if (normalized === "false") return false
  return fallback
}

function readPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const RUN_RECIPE_RELINK = readBoolean(process.env.RUN_RECIPE_RELINK, true)
const RUN_PRODUCT_RELINK = readBoolean(process.env.RUN_PRODUCT_RELINK, true)
const RESET_ALL = readBoolean(process.env.RESET_ALL, false)
const RELINK_BATCH_SIZE = readPositiveInt(process.env.RELINK_BATCH_SIZE, 500)
const RELINK_MAX_BATCHES = readPositiveInt(process.env.RELINK_MAX_BATCHES, 200)
const MIN_RELINK_BATCH_SIZE = 25

function normalizeResult(input) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input)
    } catch {
      return input
    }
  }
  return input
}

function processedCount(result) {
  const n = normalizeResult(result)
  if (Array.isArray(n)) return n.length
  if (!n || typeof n !== "object") return 0
  if (Array.isArray(n.rows)) return n.rows.length

  const numericFields = ["total", "count", "processed_count", "changed_count", "relinked", "updated"]
  for (const key of numericFields) {
    if (key in n) {
      const parsed = Number(n[key])
      if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
  }
  return 0
}

function changedCount(result) {
  const n = normalizeResult(result)
  if (Array.isArray(n)) {
    return n.filter((row) => row && typeof row === "object" && (row.changed === true || row.changed === 1)).length
  }
  if (!n || typeof n !== "object") return 0
  if ("changed_count" in n) return Number(n.changed_count) || 0
  if ("changed" in n) return n.changed === true || n.changed === 1 ? 1 : 0
  if ("relinked" in n) return Number(n.relinked) || 0
  if ("updated" in n) return Number(n.updated) || 0
  if (Array.isArray(n.rows)) {
    return n.rows.filter((row) => row && typeof row === "object" && (row.changed === true || row.changed === 1)).length
  }
  return 0
}

function queuedCount(result) {
  const n = normalizeResult(result)
  if (Array.isArray(n)) {
    return n.filter(
      (row) => row && typeof row === "object" && String(row.ri_match_strategy || "").toLowerCase() === "unmatched"
    ).length
  }
  if (!n || typeof n !== "object") return 0
  if ("queued_count" in n) return Number(n.queued_count) || 0
  if (Array.isArray(n.rows)) {
    return n.rows.filter(
      (row) => row && typeof row === "object" && String(row.ri_match_strategy || "").toLowerCase() === "unmatched"
    ).length
  }
  return 0
}

function errorText(payload) {
  if (typeof payload === "string") return payload
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function isMissingFunctionError(payload, functionName) {
  const text = errorText(payload)
  return /PGRST202|Could not find the function/i.test(text) && text.toLowerCase().includes(functionName.toLowerCase())
}

function isKnownProductSchemaDrift(payload) {
  const text = errorText(payload)
  return /"code"\s*:\s*"42703"/i.test(text) &&
    /ingredients_history/i.test(text) &&
    /standardized_ingredient_id/i.test(text)
}

function isStatementTimeoutError(payload) {
  const text = errorText(payload)
  return /"code"\s*:\s*"57014"/i.test(text) && /statement timeout/i.test(text)
}

async function postRpc(functionName, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  let payload = text
  try {
    payload = JSON.parse(text)
  } catch {
    // Keep plain text payload
  }

  return { ok: response.ok, status: response.status, payload }
}

async function runRecipeRelinkBatched() {
  console.log("=== Relinking Recipe Ingredients ===")
  console.log(`Batch config: size=${RELINK_BATCH_SIZE}, max_batches=${RELINK_MAX_BATCHES}`)

  let allowBatchArgs = true
  let offset = 0
  let batch = 1
  let totalProcessed = 0
  let totalChanged = 0
  let totalQueued = 0

  while (batch <= RELINK_MAX_BATCHES) {
    const body = allowBatchArgs ? { p_limit: RELINK_BATCH_SIZE, p_offset: offset } : {}
    const { ok, status, payload } = await postRpc("fn_relink_recipe_ingredients", body)

    if (!ok) {
      if (allowBatchArgs && isMissingFunctionError(payload, "fn_relink_recipe_ingredients")) {
        console.log("Batch args unsupported for fn_relink_recipe_ingredients; falling back to single non-batched call.")
        allowBatchArgs = false
        offset = 0
        batch = 1
        totalProcessed = 0
        totalChanged = 0
        totalQueued = 0
        continue
      }

      throw new Error(
        `Recipe relink RPC failed (HTTP ${status}). Response body:\n${errorText(payload)}`
      )
    }

    const batchProcessed = processedCount(payload)
    const batchChanged = changedCount(payload)
    const batchQueued = queuedCount(payload)

    totalProcessed += batchProcessed
    totalChanged += batchChanged
    totalQueued += batchQueued

    console.log(
      `Recipe batch ${batch}: processed=${batchProcessed}, relinked=${batchChanged}, queued=${batchQueued}`
    )

    if (!allowBatchArgs) break
    if (batchProcessed === 0 || batchProcessed < RELINK_BATCH_SIZE) break

    offset += RELINK_BATCH_SIZE
    batch += 1
  }

  if (batch > RELINK_MAX_BATCHES) {
    console.log(`Reached RELINK_MAX_BATCHES=${RELINK_MAX_BATCHES}; stopping early.`)
  }

  console.log(`Recipe totals: processed=${totalProcessed}, relinked=${totalChanged}, queued=${totalQueued}`)
}

async function runProductRelinkBatched() {
  console.log("=== Relinking Product Mappings ===")
  console.log(`Batch config: size=${RELINK_BATCH_SIZE}, max_batches=${RELINK_MAX_BATCHES}`)

  const baseBody = RESET_ALL ? { p_reset_all: true } : { p_older_than: "1 month" }

  let allowBatchArgs = true
  let currentBatchSize = RELINK_BATCH_SIZE
  let offset = 0
  let batch = 1
  let totalProcessed = 0
  let totalChanged = 0

  while (batch <= RELINK_MAX_BATCHES) {
    const body = allowBatchArgs
      ? { ...baseBody, p_limit: currentBatchSize, p_offset: offset }
      : baseBody

    const { ok, status, payload } = await postRpc("fn_relink_product_mappings", body)

    if (!ok) {
      if (allowBatchArgs && isMissingFunctionError(payload, "fn_relink_product_mappings")) {
        console.log("Batch args unsupported for fn_relink_product_mappings; falling back to single non-batched call.")
        allowBatchArgs = false
        offset = 0
        batch = 1
        totalProcessed = 0
        totalChanged = 0
        continue
      }

      if (allowBatchArgs && isStatementTimeoutError(payload)) {
        if (currentBatchSize > MIN_RELINK_BATCH_SIZE) {
          const nextBatchSize = Math.max(MIN_RELINK_BATCH_SIZE, Math.floor(currentBatchSize / 2))
          console.log(
            `Product relink batch timed out at offset=${offset} with size=${currentBatchSize}; retrying with size=${nextBatchSize}.`
          )
          currentBatchSize = nextBatchSize
          continue
        }
      }

      if (isMissingFunctionError(payload, "fn_relink_product_mappings")) {
        console.log("Skipping product relink because fn_relink_product_mappings is not available in this environment.")
        return
      }

      if (isKnownProductSchemaDrift(payload)) {
        console.log(
          "Skipping product relink due to known schema drift (ingredients_history.standardized_ingredient_id missing)."
        )
        return
      }

      throw new Error(
        `Product relink RPC failed (HTTP ${status}). Response body:\n${errorText(payload)}`
      )
    }

    const batchProcessed = processedCount(payload)
    const batchChanged = changedCount(payload)

    totalProcessed += batchProcessed
    totalChanged += batchChanged

    console.log(`Product batch ${batch}: processed=${batchProcessed}, relinked=${batchChanged}`)

    if (!allowBatchArgs) break
    if (batchProcessed === 0 || batchProcessed < currentBatchSize) break

    offset += currentBatchSize
    batch += 1
  }

  if (batch > RELINK_MAX_BATCHES) {
    console.log(`Reached RELINK_MAX_BATCHES=${RELINK_MAX_BATCHES}; stopping early.`)
  }

  console.log(`Product totals: processed=${totalProcessed}, relinked=${totalChanged}`)
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing required env: SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY")
  }

  if (RUN_RECIPE_RELINK) {
    await runRecipeRelinkBatched()
  } else {
    console.log("Skipping recipe relink (RUN_RECIPE_RELINK=false).")
  }

  if (RUN_PRODUCT_RELINK) {
    await runProductRelinkBatched()
  } else {
    console.log("Skipping product relink (RUN_PRODUCT_RELINK=false).")
  }
}

main().catch((error) => {
  console.error("[regenerate-mappings] Unhandled error:")
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
