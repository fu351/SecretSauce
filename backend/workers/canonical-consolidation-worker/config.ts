import { readPositiveInt, readBoundedFloat, readBoolean } from "../env-utils"

export interface CanonicalConsolidationWorkerConfig {
  batchLimit: number
  maxCycles: number
  workerIntervalSeconds: number
  minSimilarity: number
  minEventCount: number
  dryRun: boolean
  workerName: string
  // Weighted Lp heuristic: allow non-trivial lateral variants when embedding
  // similarity is very high AND both canonicals have significant product usage.
  // Mirrors the product-count-weighted projection from the analysis scripts.
  weightedSimilarityThreshold: number
  minWeightedProductCount: number
  enableClusterPlanning: boolean
}

export function getCanonicalConsolidationWorkerConfigFromEnv(
  overrides?: Partial<CanonicalConsolidationWorkerConfig>
): CanonicalConsolidationWorkerConfig {
  return {
    batchLimit: readPositiveInt(process.env.CONSOLIDATION_BATCH_LIMIT, 50),
    maxCycles: overrides?.maxCycles ?? readPositiveInt(process.env.CONSOLIDATION_MAX_CYCLES, 0),
    workerIntervalSeconds: readPositiveInt(process.env.CONSOLIDATION_INTERVAL_SECONDS, 86400),
    minSimilarity: readBoundedFloat(process.env.CONSOLIDATION_MIN_SIMILARITY, 0.92, 0.5, 1.0),
    minEventCount: readPositiveInt(process.env.CONSOLIDATION_MIN_EVENT_COUNT, 2),
    dryRun: readBoolean(process.env.CONSOLIDATION_DRY_RUN, true),
    workerName:
      process.env.CONSOLIDATION_WORKER_NAME?.trim() || "canonical-consolidation-worker",
    weightedSimilarityThreshold: readBoundedFloat(
      process.env.CONSOLIDATION_WEIGHTED_SIMILARITY_THRESHOLD,
      0.97,
      0.5,
      1.0
    ),
    minWeightedProductCount: readPositiveInt(process.env.CONSOLIDATION_MIN_WEIGHTED_PRODUCT_COUNT, 5),
    enableClusterPlanning: readBoolean(process.env.CONSOLIDATION_ENABLE_CLUSTER_PLANNING, true),
    ...overrides,
  }
}
