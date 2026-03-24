#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "../queue/canonical-consolidation-worker/config"
import * as processorModule from "../queue/canonical-consolidation-worker/processor"
import type { CanonicalConsolidationWorkerConfig } from "../queue/canonical-consolidation-worker/config"
import type { CanonicalConsolidationRunSummary } from "../queue/canonical-consolidation-worker/processor"

const getCanonicalConsolidationWorkerConfigFromEnv =
  (configModule as { getCanonicalConsolidationWorkerConfigFromEnv?: unknown }).getCanonicalConsolidationWorkerConfigFromEnv ??
  (configModule as { default?: { getCanonicalConsolidationWorkerConfigFromEnv?: unknown } }).default
    ?.getCanonicalConsolidationWorkerConfigFromEnv

const runCanonicalConsolidation =
  (processorModule as { runCanonicalConsolidation?: unknown }).runCanonicalConsolidation ??
  (processorModule as { default?: { runCanonicalConsolidation?: unknown } }).default?.runCanonicalConsolidation

if (typeof getCanonicalConsolidationWorkerConfigFromEnv !== "function") {
  throw new Error("Failed to load getCanonicalConsolidationWorkerConfigFromEnv")
}

if (typeof runCanonicalConsolidation !== "function") {
  throw new Error("Failed to load runCanonicalConsolidation")
}

const getConfigFn = getCanonicalConsolidationWorkerConfigFromEnv as (
  overrides?: Partial<CanonicalConsolidationWorkerConfig>
) => CanonicalConsolidationWorkerConfig

const runFn = runCanonicalConsolidation as (
  config: CanonicalConsolidationWorkerConfig
) => Promise<CanonicalConsolidationRunSummary>

function requireSupabaseEnv(): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    )
  }
}

async function main(): Promise<void> {
  requireSupabaseEnv()
  const config = getConfigFn()
  await runFn(config)
}

main().catch((error: unknown) => {
  console.error("[CanonicalConsolidationResolver] Unhandled error:", error)
  process.exit(1)
})
