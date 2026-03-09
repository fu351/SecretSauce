import * as configModule from "./config"
import * as processorModule from "./processor"
import type { EmbeddingWorkerConfig } from "./config"
import { sleep } from "../env-utils"

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
) => Promise<unknown>


export async function runEmbeddingQueueWorkerLoop(
  overrides?: Partial<EmbeddingWorkerConfig>
): Promise<void> {
  const config = getEmbeddingWorkerConfigFromEnvFn(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runEmbeddingQueueResolverFn({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[EmbeddingQueueRunner] Worker cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (process.argv[1] && process.argv[1].includes("queue/embedding-worker/runner")) {
  runEmbeddingQueueWorkerLoop().catch((error) => {
    console.error("[EmbeddingQueueRunner] Unhandled error:", error)
    process.exit(1)
  })
}
