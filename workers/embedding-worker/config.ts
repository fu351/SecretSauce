import type { EmbeddingSourceType } from "../../lib/database/embedding-queue-db"
import { readPositiveInt, readBoolean } from "../env-utils"

export type EmbeddingProvider = "openai" | "ollama"

export interface EmbeddingWorkerConfig {
  resolverName: string
  batchLimit: number
  maxCycles: number
  leaseSeconds: number
  workerIntervalSeconds: number
  requeueLimit: number
  sourceType: EmbeddingSourceType | "any"
  dryRun: boolean
  embeddingProvider: EmbeddingProvider
  embeddingModel: string
  ollamaBaseUrl: string
  requestTimeoutMs: number
}


function resolveSourceType(value: string | undefined): EmbeddingSourceType | "any" {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "recipe" || normalized === "ingredient") return normalized
  return "any"
}

function resolveProvider(value: string | undefined): EmbeddingProvider {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "ollama") return "ollama"
  return "openai"
}

function resolveModel(value: string | undefined, provider: EmbeddingProvider): string {
  const normalized = String(value ?? "").trim()
  if (normalized) return normalized
  return provider === "ollama" ? "nomic-embed-text" : "text-embedding-3-small"
}

export function getEmbeddingWorkerConfigFromEnv(
  overrides?: Partial<EmbeddingWorkerConfig>
): EmbeddingWorkerConfig {
  const embeddingProvider = overrides?.embeddingProvider ?? resolveProvider(process.env.EMBEDDING_PROVIDER)
  return {
    resolverName: process.env.EMBEDDING_QUEUE_RESOLVER_NAME || "embedding-queue-worker",
    batchLimit: readPositiveInt(process.env.EMBEDDING_QUEUE_BATCH_LIMIT, 50),
    maxCycles: overrides?.maxCycles ?? readPositiveInt(process.env.EMBEDDING_QUEUE_MAX_CYCLES, 0),
    leaseSeconds: readPositiveInt(process.env.EMBEDDING_QUEUE_LEASE_SECONDS, 180),
    workerIntervalSeconds: readPositiveInt(process.env.EMBEDDING_WORKER_INTERVAL_SECONDS, 300),
    requeueLimit: readPositiveInt(process.env.EMBEDDING_QUEUE_REQUEUE_LIMIT, 500),
    sourceType: resolveSourceType(process.env.EMBEDDING_WORKER_SOURCE_TYPE),
    dryRun: readBoolean(process.env.EMBEDDING_DRY_RUN, false),
    embeddingProvider,
    embeddingModel: resolveModel(process.env.EMBEDDING_OPENAI_MODEL, embeddingProvider),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434",
    requestTimeoutMs: readPositiveInt(process.env.EMBEDDING_WORKER_REQUEST_TIMEOUT_MS, 30000),
    ...overrides,
  }
}
