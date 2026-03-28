#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "../workers/canonical-consolidation-worker/config"
import * as processorModule from "../workers/canonical-consolidation-worker/processor"
import { requireSupabaseEnv } from "../workers/env-utils"
import type { CanonicalConsolidationWorkerConfig } from "../workers/canonical-consolidation-worker/config"
import type { CanonicalConsolidationRunSummary } from "../workers/canonical-consolidation-worker/processor"

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

export async function runCanonicalConsolidationPipeline(
  overrides?: Partial<CanonicalConsolidationWorkerConfig>
): Promise<CanonicalConsolidationRunSummary> {
  requireSupabaseEnv()
  return runFn(getConfigFn(overrides))
}

if (
  process.argv[1] &&
  process.argv[1].includes("backend/orchestrators/canonical-consolidation-pipeline")
) {
  runCanonicalConsolidationPipeline().catch((error: unknown) => {
    console.error("[CanonicalConsolidationPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
