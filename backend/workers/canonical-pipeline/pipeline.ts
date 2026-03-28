import { runEmbeddingWorker, type ProbationEmbeddingRunSummary } from "../embedding-worker/processor"
import { runVectorDoubleCheckDiscovery, type VectorDoubleCheckRunSummary } from "../vector-double-check-worker/processor"
import { runCanonicalConsolidation, type CanonicalConsolidationRunSummary } from "../canonical-consolidation-worker/processor"
import type { CanonicalPipelineConfig } from "./config"

export interface CanonicalPipelineSummary {
  probationEmbedding: ProbationEmbeddingRunSummary | null
  vectorDiscovery: VectorDoubleCheckRunSummary | null
  consolidation: CanonicalConsolidationRunSummary | null
  stageErrors: string[]
}

export async function runCanonicalPipeline(
  config: CanonicalPipelineConfig
): Promise<CanonicalPipelineSummary> {
  const summary: CanonicalPipelineSummary = {
    probationEmbedding: null,
    vectorDiscovery: null,
    consolidation: null,
    stageErrors: [],
  }

  // Stage 1: Probation embedding
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
        // Queue-mode fields not used in probation-embedding mode — supply safe defaults
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

  // Stage 2: Vector discovery
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

  // Stage 3: Canonical consolidation
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
