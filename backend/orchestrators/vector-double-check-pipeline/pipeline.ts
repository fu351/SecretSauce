#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "../../workers/vector-double-check-worker/config"
import * as processorModule from "../../workers/vector-double-check-worker/processor"
import { requireSupabaseEnv } from "../../workers/env-utils"
import type { VectorDoubleCheckWorkerConfig } from "../../workers/vector-double-check-worker/config"
import type { VectorDoubleCheckRunSummary } from "../../workers/vector-double-check-worker/processor"

const getVectorDoubleCheckWorkerConfigFromEnv =
  (configModule as { getVectorDoubleCheckWorkerConfigFromEnv?: unknown }).getVectorDoubleCheckWorkerConfigFromEnv ??
  (configModule as { default?: { getVectorDoubleCheckWorkerConfigFromEnv?: unknown } }).default
    ?.getVectorDoubleCheckWorkerConfigFromEnv

const runVectorDoubleCheckDiscovery =
  (processorModule as { runVectorDoubleCheckDiscovery?: unknown }).runVectorDoubleCheckDiscovery ??
  (processorModule as { default?: { runVectorDoubleCheckDiscovery?: unknown } }).default?.runVectorDoubleCheckDiscovery

if (typeof getVectorDoubleCheckWorkerConfigFromEnv !== "function") {
  throw new Error("Failed to load getVectorDoubleCheckWorkerConfigFromEnv from vector double-check worker config module")
}

if (typeof runVectorDoubleCheckDiscovery !== "function") {
  throw new Error("Failed to load runVectorDoubleCheckDiscovery from vector double-check worker processor module")
}

const getVectorDoubleCheckWorkerConfigFromEnvFn = getVectorDoubleCheckWorkerConfigFromEnv as (
  overrides?: Partial<VectorDoubleCheckWorkerConfig>
) => VectorDoubleCheckWorkerConfig

const runVectorDoubleCheckDiscoveryFn = runVectorDoubleCheckDiscovery as (
  config: VectorDoubleCheckWorkerConfig
) => Promise<VectorDoubleCheckRunSummary>

export async function runVectorDoubleCheckPipeline(
  overrides?: Partial<VectorDoubleCheckWorkerConfig>
): Promise<VectorDoubleCheckRunSummary> {
  requireSupabaseEnv()
  const config = getVectorDoubleCheckWorkerConfigFromEnvFn(overrides)
  return runVectorDoubleCheckDiscoveryFn(config)
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+vector-double-check-pipeline[\\/]+pipeline(?:\.ts)?$/i.test(process.argv[1])
) {
  runVectorDoubleCheckPipeline().catch((error: unknown) => {
    console.error("[VectorDoubleCheckPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
