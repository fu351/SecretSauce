#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "../workers/embedding-worker/config"
import * as processorModule from "../workers/embedding-worker/processor"
import type { EmbeddingWorkerConfig } from "../workers/embedding-worker/config"
import type { EmbeddingQueueRunSummary } from "../workers/embedding-worker/processor"

const getEmbeddingWorkerConfigFromEnv =
  (configModule as { getEmbeddingWorkerConfigFromEnv?: unknown }).getEmbeddingWorkerConfigFromEnv ??
  (configModule as { default?: { getEmbeddingWorkerConfigFromEnv?: unknown } }).default
    ?.getEmbeddingWorkerConfigFromEnv

const runEmbeddingQueueResolver =
  (processorModule as { runEmbeddingQueueResolver?: unknown }).runEmbeddingQueueResolver ??
  (processorModule as { default?: { runEmbeddingQueueResolver?: unknown } }).default?.runEmbeddingQueueResolver

if (typeof getEmbeddingWorkerConfigFromEnv !== "function") {
  throw new Error("Failed to load getEmbeddingWorkerConfigFromEnv from embedding worker config module")
}

if (typeof runEmbeddingQueueResolver !== "function") {
  throw new Error("Failed to load runEmbeddingQueueResolver from embedding worker processor module")
}

const getEmbeddingWorkerConfigFromEnvFn = getEmbeddingWorkerConfigFromEnv as (
  overrides?: Partial<EmbeddingWorkerConfig>
) => EmbeddingWorkerConfig

const runEmbeddingQueueResolverFn = runEmbeddingQueueResolver as (
  config: EmbeddingWorkerConfig
) => Promise<EmbeddingQueueRunSummary>

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
  const config = getEmbeddingWorkerConfigFromEnvFn()
  const summary = await runEmbeddingQueueResolverFn(config)

  if (config.dryRun && summary.cycles > 0) {
    console.log("\n========== EMBEDDING DRY RUN RESULTS ==========")
    console.log(
      JSON.stringify(
        {
          summary: {
            cycles: summary.cycles,
            totalRequeued: summary.totalRequeued,
            totalClaimed: summary.totalClaimed,
            totalCompleted: summary.totalCompleted,
            totalFailed: summary.totalFailed,
          },
          rows: summary.dryRunRows || [],
        },
        null,
        2
      )
    )
    console.log("===============================================\n")
  }
}

main().catch((error: unknown) => {
  console.error("[EmbeddingQueueResolver] Unhandled error:", error)
  process.exit(1)
})
