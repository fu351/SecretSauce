import { readBoolean, readBoundedFloat, readPositiveInt } from "../env-utils"

export type CanonicalMedoidWorkerMode = "initiation" | "perturbation"

export interface CanonicalMedoidWorkerConfig {
  batchLimit: number
  maxCycles: number
  workerIntervalSeconds: number
  minSimilarity: number
  minEventCount: number
  dryRun: boolean
  workerName: string
  mode: CanonicalMedoidWorkerMode
  stabilityDelta: number
  snapshotMonth?: string
}

function normalizeMode(value: string | undefined): CanonicalMedoidWorkerMode {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "initiation") return "initiation"
  if (normalized === "perturbation" || normalized === "pertubation") return "perturbation"
  return "perturbation"
}

export function getCanonicalMedoidWorkerConfigFromEnv(
  overrides?: Partial<CanonicalMedoidWorkerConfig>
): CanonicalMedoidWorkerConfig {
  return {
    batchLimit: readPositiveInt(process.env.CANONICAL_MEDOID_BATCH_LIMIT, 250),
    maxCycles: overrides?.maxCycles ?? readPositiveInt(process.env.CANONICAL_MEDOID_MAX_CYCLES, 0),
    workerIntervalSeconds: readPositiveInt(process.env.CANONICAL_MEDOID_INTERVAL_SECONDS, 30 * 24 * 60 * 60),
    minSimilarity: readBoundedFloat(process.env.CANONICAL_MEDOID_MIN_SIMILARITY, 0.92, 0.5, 1.0),
    minEventCount: readPositiveInt(process.env.CANONICAL_MEDOID_MIN_EVENT_COUNT, 2),
    dryRun: readBoolean(process.env.CANONICAL_MEDOID_DRY_RUN, false),
    workerName: process.env.CANONICAL_MEDOID_WORKER_NAME?.trim() || "canonical-medoid-worker",
    mode: normalizeMode(process.env.CANONICAL_MEDOID_MODE),
    stabilityDelta: readBoundedFloat(process.env.CANONICAL_MEDOID_STABILITY_DELTA, 0.015, 0, 0.5),
    snapshotMonth: process.env.CANONICAL_MEDOID_SNAPSHOT_MONTH?.trim() || undefined,
    ...overrides,
  }
}
