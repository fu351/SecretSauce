#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "../workers/vector-double-check-worker/config"
import * as processorModule from "../workers/vector-double-check-worker/processor"
import type { VectorDoubleCheckWorkerConfig } from "../workers/vector-double-check-worker/config"
import type { VectorDoubleCheckRunSummary } from "../workers/vector-double-check-worker/processor"

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
  const config = getVectorDoubleCheckWorkerConfigFromEnvFn()
  await runVectorDoubleCheckDiscoveryFn(config)
}

main().catch((error: unknown) => {
  console.error("[VectorDoubleCheckResolver] Unhandled error:", error)
  process.exit(1)
})
