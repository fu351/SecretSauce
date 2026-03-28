import * as configModule from "../workers/embedding-worker/config"
import * as processorModule from "../workers/embedding-worker/processor"
import type { EmbeddingWorkerConfig } from "../workers/embedding-worker/config"
import { sleep } from "../workers/env-utils"

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
) => Promise<unknown>

export async function runEmbeddingQueuePipelineRunner(
  overrides?: Partial<EmbeddingWorkerConfig>
): Promise<void> {
  const config = getEmbeddingWorkerConfigFromEnvFn(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runEmbeddingWorkerFn({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[EmbeddingQueuePipelineRunner] Pipeline cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (
  process.argv[1] &&
  process.argv[1].includes("backend/orchestrators/embedding-queue-pipeline-runner")
) {
  runEmbeddingQueuePipelineRunner().catch((error) => {
    console.error("[EmbeddingQueuePipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
