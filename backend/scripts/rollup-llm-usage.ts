#!/usr/bin/env tsx

import "./load-env"
import { createClient } from "@supabase/supabase-js"

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function resolveRollupDate(): string | undefined {
  const raw = process.env.LLM_USAGE_ROLLUP_DATE?.trim()
  if (!raw) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("LLM_USAGE_ROLLUP_DATE must be YYYY-MM-DD")
  }
  return raw
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const rollupDate = resolveRollupDate()
  const purgeDays = readPositiveInt(process.env.LLM_USAGE_PURGE_DAYS, 30)
  const skipPurge = String(process.env.LLM_USAGE_SKIP_PURGE || "").toLowerCase() === "true"

  console.log(
    `[LLMUsageRollup] Starting rollup date=${rollupDate || "database default"} purgeDays=${purgeDays} skipPurge=${skipPurge}`
  )

  const rollupArgs = rollupDate ? { p_usage_date: rollupDate } : {}
  const { data: rolledUpRows, error: rollupError } = await supabase.rpc(
    "fn_rollup_llm_usage_daily",
    rollupArgs
  )

  if (rollupError) {
    throw new Error(`LLM usage rollup failed: ${rollupError.message}`)
  }

  console.log(`[LLMUsageRollup] Upserted ${rolledUpRows ?? 0} daily aggregate row(s)`)

  if (!skipPurge) {
    const { data: purgedRows, error: purgeError } = await supabase.rpc(
      "fn_purge_llm_usage_events",
      { p_older_than_days: purgeDays }
    )

    if (purgeError) {
      throw new Error(`LLM usage purge failed: ${purgeError.message}`)
    }

    console.log(`[LLMUsageRollup] Purged ${purgedRows ?? 0} raw event row(s)`)
  }
}

main().catch((error) => {
  console.error("[LLMUsageRollup] Failed:", error)
  process.exit(1)
})
