#!/usr/bin/env tsx

import "dotenv/config"
import { runEmbeddingWorker, type ProbationEmbeddingRunSummary, type EmbeddingQueueRunSummary } from "../../workers/embedding-worker/processor"
import { runVectorDoubleCheckDiscovery, type VectorDoubleCheckRunSummary } from "../../workers/vector-double-check-worker/processor"
import { runCanonicalConsolidation, type CanonicalConsolidationRunSummary } from "../../workers/canonical-consolidation-worker/processor"
import { getCanonicalPipelineConfigFromEnv, type CanonicalPipelineConfig } from "./config"
import { requireSupabaseEnv } from "../../workers/env-utils"

export interface CanonicalPipelineSummary {
  probationEmbedding: ProbationEmbeddingRunSummary | null
  queueEmbedding: EmbeddingQueueRunSummary | null
  vectorDiscovery: VectorDoubleCheckRunSummary | null
  consolidation: CanonicalConsolidationRunSummary | null
  stageErrors: string[]
}

export async function runCanonicalPipeline(
  config: CanonicalPipelineConfig
): Promise<CanonicalPipelineSummary> {
  const summary: CanonicalPipelineSummary = {
    probationEmbedding: null,
    queueEmbedding: null,
    vectorDiscovery: null,
    consolidation: null,
    stageErrors: [],
  }

  if (config.enableProbationEmbedding) {
    try {
      console.log("[CanonicalPipeline] Starting stage 1: probation-embedding")
      const workerResult = await runEmbeddingWorker({
        mode: "probation-embedding",
        resolverName: "canonical-pipeline-embedding",
        dryRun: config.dryRun,
        ollamaBaseUrl: config.ollamaBaseUrl,
        embeddingModel: config.embeddingModel,
        probationBatchLimit: config.probationBatchLimit,
        probationMinDistinctSources: config.probationMinDistinctSources,
        batchLimit: config.probationBatchLimit,
        maxCycles: 0,
        leaseSeconds: 180,
        workerIntervalSeconds: config.workerIntervalSeconds,
        requeueLimit: 500,
        sourceType: "any",
        requestTimeoutMs: 30000,
      })
      summary.probationEmbedding = workerResult.result as ProbationEmbeddingRunSummary
      console.log(
        `[CanonicalPipeline] Stage 1 done: found=${summary.probationEmbedding.totalFound} ` +
          `embedded=${summary.probationEmbedding.totalEmbedded} failed=${summary.probationEmbedding.totalFailed}`
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[CanonicalPipeline] Stage 1 (probation-embedding) failed:", msg)
      summary.stageErrors.push(`probation-embedding: ${msg}`)
      if (config.stopOnStageError) throw error
    }
  } else {
    console.log("[CanonicalPipeline] Stage 1 (probation-embedding) skipped")
  }

  if (config.enableQueueEmbedding) {
    try {
      console.log("[CanonicalPipeline] Starting stage 1b: queue-embedding")
      const workerResult = await runEmbeddingWorker({
        mode: "queue-all",
        resolverName: "canonical-pipeline-queue-embedding",
        dryRun: config.dryRun,
        ollamaBaseUrl: config.ollamaBaseUrl,
        embeddingModel: config.embeddingModel,
        probationBatchLimit: config.probationBatchLimit,
        probationMinDistinctSources: config.probationMinDistinctSources,
        batchLimit: config.queueBatchLimit,
        maxCycles: 0,
        leaseSeconds: 180,
        workerIntervalSeconds: config.workerIntervalSeconds,
        requeueLimit: 500,
        sourceType: "any",
        requestTimeoutMs: 30000,
      })
      summary.queueEmbedding = workerResult.result as EmbeddingQueueRunSummary
      console.log(
        `[CanonicalPipeline] Stage 1b done: ` +
          `claimed=${summary.queueEmbedding.totalClaimed} completed=${summary.queueEmbedding.totalCompleted} ` +
          `failed=${summary.queueEmbedding.totalFailed}`
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[CanonicalPipeline] Stage 1b (queue-embedding) failed:", msg)
      summary.stageErrors.push(`queue-embedding: ${msg}`)
      if (config.stopOnStageError) throw error
    }
  } else {
    console.log("[CanonicalPipeline] Stage 1b (queue-embedding) skipped")
  }

  if (config.enableVectorDiscovery) {
    try {
      console.log("[CanonicalPipeline] Starting stage 2: vector-discovery")
      summary.vectorDiscovery = await runVectorDoubleCheckDiscovery({
        dryRun: config.dryRun,
        similarityThreshold: config.vectorSimilarityThreshold,
        batchLimit: config.vectorBatchLimit,
        embeddingModel: config.vectorEmbeddingModel,
        maxCycles: 0,
        workerIntervalSeconds: config.workerIntervalSeconds,
      })
      console.log(
        `[CanonicalPipeline] Stage 2 done: discovered=${summary.vectorDiscovery.totalDiscovered} ` +
          `logged=${summary.vectorDiscovery.totalLogged} skipped=${summary.vectorDiscovery.totalSkipped}`
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[CanonicalPipeline] Stage 2 (vector-discovery) failed:", msg)
      summary.stageErrors.push(`vector-discovery: ${msg}`)
      if (config.stopOnStageError) throw error
    }
  } else {
    console.log("[CanonicalPipeline] Stage 2 (vector-discovery) skipped")
  }

  if (config.enableConsolidation) {
    try {
      console.log("[CanonicalPipeline] Starting stage 3: consolidation")
      summary.consolidation = await runCanonicalConsolidation({
        dryRun: config.dryRun,
        minSimilarity: config.consolidationMinSimilarity,
        minEventCount: config.consolidationMinEventCount,
        batchLimit: config.consolidationBatchLimit,
        enableClusterPlanning: config.consolidationEnableClusterPlanning,
        weightedSimilarityThreshold: config.consolidationWeightedSimilarityThreshold,
        minWeightedProductCount: config.consolidationMinWeightedProductCount,
        maxCycles: 0,
        workerIntervalSeconds: config.workerIntervalSeconds,
        workerName: "canonical-pipeline",
      })
      console.log(
        `[CanonicalPipeline] Stage 3 done: consolidated=${summary.consolidation.totalConsolidated} ` +
          `skipped=${summary.consolidation.totalSkipped} failed=${summary.consolidation.totalFailed}`
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error("[CanonicalPipeline] Stage 3 (consolidation) failed:", msg)
      summary.stageErrors.push(`consolidation: ${msg}`)
      if (config.stopOnStageError) throw error
    }
  } else {
    console.log("[CanonicalPipeline] Stage 3 (consolidation) skipped")
  }

  return summary
}

export async function runCanonicalPipelineEntrypoint(
  overrides?: Partial<CanonicalPipelineConfig>
): Promise<CanonicalPipelineSummary> {
  requireSupabaseEnv()
  const config = getCanonicalPipelineConfigFromEnv(overrides)
  console.log(
    `[CanonicalPipeline] Starting pipeline ` +
      `(dryRun=${config.dryRun}, stopOnStageError=${config.stopOnStageError}, ` +
      `stages=[` +
      `probation-embedding:${config.enableProbationEmbedding}, ` +
      `queue-embedding:${config.enableQueueEmbedding}, ` +
      `vector-discovery:${config.enableVectorDiscovery}, ` +
      `consolidation:${config.enableConsolidation}])`
  )

  const summary = await runCanonicalPipeline(config)
  console.log("[CanonicalPipeline] Pipeline complete")
  console.log(JSON.stringify(summary, null, 2))

  if (summary.stageErrors.length > 0) {
    console.error("[CanonicalPipeline] Stage errors:", summary.stageErrors)
    process.exit(1)
  }

  return summary
}

const isCanonicalPipelineEntrypoint =
  typeof process.argv[1] === "string" &&
  /backend[\\/]+orchestrators[\\/]+canonical-pipeline[\\/]+pipeline(?:\.ts)?$/i.test(process.argv[1])

if (isCanonicalPipelineEntrypoint) {
  runCanonicalPipelineEntrypoint().catch((error: unknown) => {
    console.error("[CanonicalPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
