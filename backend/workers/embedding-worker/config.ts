import type { EmbeddingSourceType } from "./embedding-queue-db"
import { readPositiveInt, readBoolean } from "../env-utils"

export interface EmbeddingWorkerConfig {
  resolverName: string
  batchLimit: number
  maxCycles: number
  leaseSeconds: number
  workerIntervalSeconds: number
  requeueLimit: number
  sourceType: EmbeddingSourceType | "any"
  dryRun: boolean
  embeddingModel: string
  ollamaBaseUrl: string
  requestTimeoutMs: number
}


function resolveSourceType(value: string | undefined): EmbeddingSourceType | "any" {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "recipe" || normalized === "ingredient") return normalized
  return "any"
}

function resolveModel(value: string | undefined): string {
  const normalized = String(value ?? "").trim()
  if (normalized) return normalized
  return "nomic-embed-text"
}

export function getEmbeddingWorkerConfigFromEnv(
  overrides?: Partial<EmbeddingWorkerConfig>
): EmbeddingWorkerConfig {
  return {
    resolverName: process.env.EMBEDDING_QUEUE_RESOLVER_NAME || "embedding-queue-worker",
    batchLimit: readPositiveInt(process.env.EMBEDDING_QUEUE_BATCH_LIMIT, 50),
    maxCycles: overrides?.maxCycles ?? readPositiveInt(process.env.EMBEDDING_QUEUE_MAX_CYCLES, 0),
    leaseSeconds: readPositiveInt(process.env.EMBEDDING_QUEUE_LEASE_SECONDS, 180),
    workerIntervalSeconds: readPositiveInt(process.env.EMBEDDING_WORKER_INTERVAL_SECONDS, 300),
    requeueLimit: readPositiveInt(process.env.EMBEDDING_QUEUE_REQUEUE_LIMIT, 500),
    sourceType: resolveSourceType(process.env.EMBEDDING_WORKER_SOURCE_TYPE),
    dryRun: readBoolean(process.env.EMBEDDING_DRY_RUN, false),
    embeddingModel: resolveModel(process.env.EMBEDDING_OPENAI_MODEL),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434",
    requestTimeoutMs: readPositiveInt(process.env.EMBEDDING_WORKER_REQUEST_TIMEOUT_MS, 30000),
    ...overrides,
  }
}
