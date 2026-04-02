#!/usr/bin/env tsx

import "dotenv/config"
import { getEmbeddingWorkerConfigFromEnv, type EmbeddingWorkerConfig } from "../../workers/embedding-worker/config"
import { runEmbeddingWorker, type EmbeddingQueueRunSummary } from "../../workers/embedding-worker/processor"
import { getVectorDoubleCheckWorkerConfigFromEnv, type VectorDoubleCheckWorkerConfig } from "../../workers/vector-double-check-worker/config"
import { runVectorDoubleCheckDiscovery, type VectorDoubleCheckRunSummary } from "../../workers/vector-double-check-worker/processor"
import { requireSupabaseEnv } from "../../workers/env-utils"

export interface VectorDoubleCheckPipelineSummary {
  embeddingQueue: EmbeddingQueueRunSummary | null
  vectorDiscovery: VectorDoubleCheckRunSummary | null
}

export async function runVectorDoubleCheckPipeline(
  overrides?: Partial<VectorDoubleCheckWorkerConfig>,
  embeddingOverrides?: Partial<EmbeddingWorkerConfig>
): Promise<VectorDoubleCheckPipelineSummary> {
  requireSupabaseEnv()

  const vectorConfig = getVectorDoubleCheckWorkerConfigFromEnv(overrides)
  const embeddingConfig = getEmbeddingWorkerConfigFromEnv({
    ...embeddingOverrides,
    mode: "queue",
    dryRun: vectorConfig.dryRun,
    embeddingModel: vectorConfig.embeddingModel,
    maxCycles: 0,
  })

  console.log("[VectorDoubleCheckPipeline] Starting stage 1: embedding-queue")
  const embeddingWorkerResult = await runEmbeddingWorker(embeddingConfig)
  if (embeddingWorkerResult.mode !== "queue") {
    throw new Error(`Expected embedding worker queue mode, got ${embeddingWorkerResult.mode}`)
  }
  const embeddingQueue = embeddingWorkerResult.result
  console.log(
    `[VectorDoubleCheckPipeline] Stage 1 done: claimed=${embeddingQueue.totalClaimed} ` +
      `completed=${embeddingQueue.totalCompleted} failed=${embeddingQueue.totalFailed}`
  )

  console.log("[VectorDoubleCheckPipeline] Starting stage 2: vector-discovery")
  const vectorDiscovery = await runVectorDoubleCheckDiscovery(vectorConfig)
  console.log(
    `[VectorDoubleCheckPipeline] Stage 2 done: discovered=${vectorDiscovery.totalDiscovered} ` +
      `logged=${vectorDiscovery.totalLogged} skipped=${vectorDiscovery.totalSkipped}`
  )

  return {
    embeddingQueue,
    vectorDiscovery,
  }
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
