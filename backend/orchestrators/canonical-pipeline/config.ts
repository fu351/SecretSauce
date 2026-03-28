import { readPositiveInt, readBoundedFloat, readBoolean } from "../../workers/env-utils"

export interface CanonicalPipelineConfig {
  dryRun: boolean
  stopOnStageError: boolean
  workerIntervalSeconds: number
  enableProbationEmbedding: boolean
  enableVectorDiscovery: boolean
  enableConsolidation: boolean
  probationBatchLimit: number
  probationMinDistinctSources: number
  ollamaBaseUrl: string
  embeddingModel: string
  vectorSimilarityThreshold: number
  vectorBatchLimit: number
  vectorEmbeddingModel: string
  consolidationMinSimilarity: number
  consolidationMinEventCount: number
  consolidationBatchLimit: number
  consolidationEnableClusterPlanning: boolean
  consolidationWeightedSimilarityThreshold: number
  consolidationMinWeightedProductCount: number
}

export function getCanonicalPipelineConfigFromEnv(
  overrides?: Partial<CanonicalPipelineConfig>
): CanonicalPipelineConfig {
  return {
    dryRun: readBoolean(process.env.PIPELINE_DRY_RUN, true),
    stopOnStageError: readBoolean(process.env.PIPELINE_STOP_ON_STAGE_ERROR, true),
    workerIntervalSeconds: readPositiveInt(process.env.PIPELINE_INTERVAL_SECONDS, 86400),
    enableProbationEmbedding: readBoolean(process.env.PIPELINE_ENABLE_PROBATION_EMBEDDING, true),
    enableVectorDiscovery: readBoolean(process.env.PIPELINE_ENABLE_VECTOR_DISCOVERY, true),
    enableConsolidation: readBoolean(process.env.PIPELINE_ENABLE_CONSOLIDATION, true),
    probationBatchLimit: readPositiveInt(process.env.PIPELINE_PROBATION_BATCH_LIMIT, 100),
    probationMinDistinctSources: readPositiveInt(process.env.PIPELINE_PROBATION_MIN_DISTINCT_SOURCES, 1),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434",
    embeddingModel: process.env.PIPELINE_EMBEDDING_MODEL?.trim() || "nomic-embed-text",
    vectorSimilarityThreshold: readBoundedFloat(process.env.PIPELINE_VECTOR_SIMILARITY_THRESHOLD, 0.88, 0.5, 1.0),
    vectorBatchLimit: readPositiveInt(process.env.PIPELINE_VECTOR_BATCH_LIMIT, 100),
    vectorEmbeddingModel: process.env.PIPELINE_VECTOR_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
    consolidationMinSimilarity: readBoundedFloat(process.env.PIPELINE_CONSOLIDATION_MIN_SIMILARITY, 0.92, 0.5, 1.0),
    consolidationMinEventCount: readPositiveInt(process.env.PIPELINE_CONSOLIDATION_MIN_EVENT_COUNT, 2),
    consolidationBatchLimit: readPositiveInt(process.env.PIPELINE_CONSOLIDATION_BATCH_LIMIT, 50),
    consolidationEnableClusterPlanning: readBoolean(process.env.PIPELINE_CONSOLIDATION_CLUSTER_PLANNING, false),
    consolidationWeightedSimilarityThreshold: readBoundedFloat(
      process.env.PIPELINE_CONSOLIDATION_WEIGHTED_SIMILARITY_THRESHOLD,
      0.97,
      0.5,
      1.0
    ),
    consolidationMinWeightedProductCount: readPositiveInt(
      process.env.PIPELINE_CONSOLIDATION_MIN_WEIGHTED_PRODUCT_COUNT,
      5
    ),
    ...overrides,
  }
}
