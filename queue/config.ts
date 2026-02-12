import { resolveIngredientStandardizerContext } from "../lib/utils/ingredient-standardizer-context"
import type { IngredientMatchQueueReviewMode, IngredientMatchQueueSource } from "../lib/database/ingredient-match-queue-db"
import type { IngredientStandardizerContext } from "../lib/utils/ingredient-standardizer-context"

export interface QueueWorkerConfig {
  resolverName: string
  batchLimit: number
  maxCycles: number
  chunkSize: number
  chunkConcurrency: number
  leaseSeconds: number
  workerIntervalSeconds: number
  dryRun: boolean
  standardizerContext: IngredientStandardizerContext
  reviewMode: IngredientMatchQueueReviewMode
  queueSource: IngredientMatchQueueSource | "any"
  doubleCheckMinConfidence: number
  doubleCheckMinSimilarity: number
  enableUnitResolution: boolean
  unitDryRun: boolean
  unitMinConfidence: number
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function readBoundedFloat(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback

  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function resolveReviewMode(value: string | undefined): IngredientMatchQueueReviewMode {
  if (value === "unit" || value === "any" || value === "ingredient") return value
  return "ingredient"
}

function resolveQueueSource(value: string | undefined): IngredientMatchQueueSource | "any" {
  if (value === "scraper" || value === "recipe" || value === "any") return value
  return "scraper"
}

export function getQueueWorkerConfigFromEnv(overrides?: Partial<QueueWorkerConfig>): QueueWorkerConfig {
  const defaultMaxCycles = readPositiveInt(process.env.QUEUE_MAX_CYCLES, 0)

  return {
    resolverName: process.env.QUEUE_RESOLVER_NAME || "queue-worker",
    batchLimit: readPositiveInt(process.env.QUEUE_BATCH_LIMIT, 25),
    maxCycles: overrides?.maxCycles ?? defaultMaxCycles,
    chunkSize: readPositiveInt(process.env.QUEUE_CHUNK_SIZE, 10),
    chunkConcurrency: readPositiveInt(process.env.QUEUE_CHUNK_CONCURRENCY, 1),
    leaseSeconds: readPositiveInt(process.env.QUEUE_LEASE_SECONDS, 180),
    workerIntervalSeconds: readPositiveInt(process.env.WORKER_INTERVAL_SECONDS, 300),
    dryRun: process.env.DRY_RUN === "true",
    standardizerContext: resolveIngredientStandardizerContext(process.env.QUEUE_STANDARDIZER_CONTEXT),
    reviewMode: resolveReviewMode(process.env.QUEUE_REVIEW_MODE),
    queueSource: resolveQueueSource(process.env.QUEUE_SOURCE),
    doubleCheckMinConfidence: readBoundedFloat(process.env.LLM_DOUBLE_CHECK_MIN_CONFIDENCE, 0.85, 0, 1),
    doubleCheckMinSimilarity: readBoundedFloat(process.env.LLM_DOUBLE_CHECK_MIN_SIMILARITY, 0.96, 0, 1),
    enableUnitResolution: readBoolean(process.env.QUEUE_ENABLE_UNIT_RESOLUTION, false),
    unitDryRun: readBoolean(process.env.QUEUE_UNIT_DRY_RUN, true),
    unitMinConfidence: readBoundedFloat(process.env.QUEUE_UNIT_MIN_CONFIDENCE, 0.75, 0, 1),
    ...overrides,
  }
}
