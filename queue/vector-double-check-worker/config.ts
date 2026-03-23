import { readPositiveInt, readBoundedFloat, readBoolean } from "../env-utils"

export interface VectorDoubleCheckWorkerConfig {
  batchLimit: number
  maxCycles: number
  workerIntervalSeconds: number
  similarityThreshold: number
  embeddingModel: string
  dryRun: boolean
}

export function getVectorDoubleCheckWorkerConfigFromEnv(
  overrides?: Partial<VectorDoubleCheckWorkerConfig>
): VectorDoubleCheckWorkerConfig {
  return {
    batchLimit: readPositiveInt(process.env.VECTOR_DC_BATCH_LIMIT, 100),
    maxCycles: overrides?.maxCycles ?? readPositiveInt(process.env.VECTOR_DC_MAX_CYCLES, 0),
    workerIntervalSeconds: readPositiveInt(process.env.VECTOR_DC_INTERVAL_SECONDS, 3600),
    similarityThreshold: readBoundedFloat(process.env.VECTOR_DC_SIMILARITY_THRESHOLD, 0.88, 0.5, 1.0),
    embeddingModel: process.env.EMBEDDING_OPENAI_MODEL?.trim() || "text-embedding-3-small",
    dryRun: readBoolean(process.env.VECTOR_DC_DRY_RUN, false),
    ...overrides,
  }
}
