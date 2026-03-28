#!/usr/bin/env tsx

import "dotenv/config"
import * as configModule from "../workers/embedding-worker/config"
import * as processorModule from "../workers/embedding-worker/processor"
import { requireSupabaseEnv } from "../workers/env-utils"
import type { EmbeddingWorkerConfig } from "../workers/embedding-worker/config"
import type { EmbeddingWorkerRunSummary } from "../workers/embedding-worker/processor"

const getEmbeddingWorkerConfigFromEnv =
  (configModule as { getEmbeddingWorkerConfigFromEnv?: unknown }).getEmbeddingWorkerConfigFromEnv ??
  (configModule as { default?: { getEmbeddingWorkerConfigFromEnv?: unknown } }).default
    ?.getEmbeddingWorkerConfigFromEnv

const runEmbeddingWorker =
  (processorModule as { runEmbeddingWorker?: unknown }).runEmbeddingWorker ??
  (processorModule as { default?: { runEmbeddingWorker?: unknown } }).default?.runEmbeddingWorker

if (typeof getEmbeddingWorkerConfigFromEnv !== "function") {
  throw new Error("Failed to load getEmbeddingWorkerConfigFromEnv from embedding worker config module")
}

if (typeof runEmbeddingWorker !== "function") {
  throw new Error("Failed to load runEmbeddingWorker from embedding worker processor module")
}

const getEmbeddingWorkerConfigFromEnvFn = getEmbeddingWorkerConfigFromEnv as (
  overrides?: Partial<EmbeddingWorkerConfig>
) => EmbeddingWorkerConfig

const runEmbeddingWorkerFn = runEmbeddingWorker as (
  config: EmbeddingWorkerConfig
) => Promise<EmbeddingWorkerRunSummary>

export async function runEmbeddingQueuePipeline(
  overrides?: Partial<EmbeddingWorkerConfig>
): Promise<EmbeddingWorkerRunSummary> {
  requireSupabaseEnv()
  const config = getEmbeddingWorkerConfigFromEnvFn(overrides)
  console.log(
    `[EmbeddingQueuePipeline] Starting (mode=${config.mode}, dryRun=${config.dryRun})`
  )
  const summary = await runEmbeddingWorkerFn(config)

  if (summary.mode === "queue" && config.dryRun && summary.result.cycles > 0) {
    const queueResult = summary.result
    console.log("\n========== EMBEDDING DRY RUN RESULTS ==========")
    console.log(
      JSON.stringify(
        {
          summary: {
            cycles: queueResult.cycles,
            totalRequeued: queueResult.totalRequeued,
            totalClaimed: queueResult.totalClaimed,
            totalCompleted: queueResult.totalCompleted,
            totalFailed: queueResult.totalFailed,
          },
          rows: queueResult.dryRunRows || [],
        },
        null,
        2
      )
    )
    console.log("===============================================\n")
  }

  return summary
}

if (process.argv[1] && process.argv[1].includes("backend/orchestrators/embedding-queue-pipeline")) {
  runEmbeddingQueuePipeline().catch((error: unknown) => {
    console.error("[EmbeddingQueuePipeline] Unhandled error:", error)
    process.exit(1)
  })
}
