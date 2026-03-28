#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "./config"
import * as processorModule from "./processor"
import { requireSupabaseEnv } from "../env-utils"
import type { VectorDoubleCheckWorkerConfig } from "./config"
import type { VectorDoubleCheckRunSummary } from "./processor"

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

async function main(): Promise<void> {
  requireSupabaseEnv()
  const config = getVectorDoubleCheckWorkerConfigFromEnvFn()
  await runVectorDoubleCheckDiscoveryFn(config)
}

main().catch((error: unknown) => {
  console.error("[VectorDoubleCheckResolver] Unhandled error:", error)
  process.exit(1)
})
