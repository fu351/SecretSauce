export const SCRAPER_WORKER_STORES = [
  "walmart",
  "target",
  "kroger",
  "meijer",
  "99ranch",
  "traderjoes",
  "aldi",
  "andronicos",
  "wholefoods",
  "safeway",
] as const

export type ScraperWorkerStore = (typeof SCRAPER_WORKER_STORES)[number]

export interface ScraperRuntimeOverrides {
  liveActivation?: boolean
  bypassTimeouts?: boolean
  timeoutMultiplier?: number
  timeoutFloorMs?: number
}

export interface ScraperWorkerProcessorJob {
  store: string
  query?: string
  queries?: string[]
  zipCode?: string | null
  targetStoreMetadata?: unknown
  runtime?: ScraperRuntimeOverrides
  batchConcurrency?: number
}

export type ScraperWorkerMode = "single" | "batch"

export interface ScraperWorkerProcessorResult {
  store: ScraperWorkerStore
  mode: ScraperWorkerMode
  query?: string
  queryCount?: number
  totalItems: number
  results: unknown[] | unknown[][]
}

const STORE_ALIASES: Record<string, ScraperWorkerStore> = {
  ranch99: "99ranch",
  whole_foods: "wholefoods",
}

export function resolveScraperWorkerStore(value: string): ScraperWorkerStore | null {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null

  if (normalized in STORE_ALIASES) {
    return STORE_ALIASES[normalized]
  }

  return (SCRAPER_WORKER_STORES as readonly string[]).includes(normalized)
    ? (normalized as ScraperWorkerStore)
    : null
}

export function resolveScraperWorkerMode(job: ScraperWorkerProcessorJob): ScraperWorkerMode {
  return Array.isArray(job.queries) && job.queries.length > 0 ? "batch" : "single"
}

export function hasRuntimeOverrides(runtime?: ScraperRuntimeOverrides): boolean {
  if (!runtime) return false
  return (
    runtime.liveActivation !== undefined ||
    runtime.bypassTimeouts !== undefined ||
    runtime.timeoutMultiplier !== undefined ||
    runtime.timeoutFloorMs !== undefined
  )
}

export function sanitizeBatchQueries(queries: string[] | undefined): string[] {
  if (!Array.isArray(queries)) return []
  return queries
    .map((query) => String(query || "").trim())
    .filter((query) => query.length > 0)
}

export function countScraperResults(results: unknown[] | unknown[][]): number {
  if (!Array.isArray(results)) return 0
  if (results.length === 0) return 0

  if (Array.isArray(results[0])) {
    return (results as unknown[][]).reduce(
      (sum, item) => sum + (Array.isArray(item) ? item.length : 0),
      0
    )
  }

  return (results as unknown[]).length
}
