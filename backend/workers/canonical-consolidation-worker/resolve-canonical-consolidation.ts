#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "./config"
import * as processorModule from "./processor"
import { requireSupabaseEnv } from "../env-utils"
import type { CanonicalConsolidationWorkerConfig } from "./config"
import type { CanonicalConsolidationRunSummary } from "./processor"

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

async function main(): Promise<void> {
  requireSupabaseEnv()
  const config = getConfigFn()
  console.log(
    `[CanonicalConsolidationResolver] Loaded config ` +
      `(dryRun=${config.dryRun}, batchLimit=${config.batchLimit}, maxCycles=${config.maxCycles})`
  )
  await runFn(config)
}

main().catch((error: unknown) => {
  console.error("[CanonicalConsolidationResolver] Unhandled error:", error)
  process.exit(1)
})
