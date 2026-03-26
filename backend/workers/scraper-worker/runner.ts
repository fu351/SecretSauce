import { sleep } from "../env-utils"
import { runScraperWorkerProcessor, type ScraperWorkerProcessorDependencies } from "./processor"
import type { ScraperWorkerProcessorJob } from "./worker"

export interface ScraperWorkerRunnerConfig {
  workerIntervalSeconds: number
  maxCycles: number
  buildJob: (cycle: number) => Promise<ScraperWorkerProcessorJob | null> | ScraperWorkerProcessorJob | null
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function parseOptionalJson<T>(value: string | undefined): T | undefined {
  const raw = String(value ?? "").trim()
  if (!raw) return undefined
  return JSON.parse(raw) as T
}

function parseQueriesJson(value: string | undefined): string[] | undefined {
  const parsed = parseOptionalJson<unknown>(value)
  if (parsed === undefined) return undefined
  if (!Array.isArray(parsed)) {
    throw new Error("SCRAPER_RUNNER_QUERIES_JSON must be a JSON array")
  }
  return parsed.map((item) => String(item))
}

function buildJobFromEnv(): ScraperWorkerProcessorJob {
  const store = String(process.env.SCRAPER_RUNNER_STORE ?? "").trim()
  if (!store) {
    throw new Error("SCRAPER_RUNNER_STORE is required")
  }

  const query = String(process.env.SCRAPER_RUNNER_QUERY ?? "").trim()
  const queries = parseQueriesJson(process.env.SCRAPER_RUNNER_QUERIES_JSON)

  if (!query && (!queries || queries.length === 0)) {
    throw new Error("SCRAPER_RUNNER_QUERY or SCRAPER_RUNNER_QUERIES_JSON is required")
  }

  return {
    store,
    query: query || undefined,
    queries,
    zipCode: process.env.SCRAPER_RUNNER_ZIP_CODE || undefined,
    targetStoreMetadata: parseOptionalJson(process.env.SCRAPER_RUNNER_TARGET_STORE_METADATA_JSON),
    batchConcurrency: Number(process.env.SCRAPER_RUNNER_BATCH_CONCURRENCY || "") || undefined,
    runtime: {
      liveActivation:
        process.env.SCRAPER_RUNNER_LIVE_ACTIVATION === "true"
          ? true
          : process.env.SCRAPER_RUNNER_LIVE_ACTIVATION === "false"
            ? false
            : undefined,
      bypassTimeouts:
        process.env.SCRAPER_RUNNER_BYPASS_TIMEOUTS === "true"
          ? true
          : process.env.SCRAPER_RUNNER_BYPASS_TIMEOUTS === "false"
            ? false
            : undefined,
      timeoutMultiplier: Number(process.env.SCRAPER_RUNNER_TIMEOUT_MULTIPLIER || "") || undefined,
      timeoutFloorMs: Number(process.env.SCRAPER_RUNNER_TIMEOUT_FLOOR_MS || "") || undefined,
    },
  }
}

export async function runScraperWorkerLoop(
  config: ScraperWorkerRunnerConfig,
  dependencies: ScraperWorkerProcessorDependencies = {}
): Promise<void> {
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000
  const maxCycles = config.maxCycles > 0 ? config.maxCycles : Infinity
  let cycles = 0

  while (cycles < maxCycles) {
    cycles += 1

    try {
      const job = await config.buildJob(cycles)
      if (!job) {
        console.log(`[ScraperRunner] Cycle ${cycles}: no job returned`)
      } else {
        const result = await runScraperWorkerProcessor(job, dependencies)
        console.log(
          `[ScraperRunner] Cycle ${cycles}: store=${result.store} mode=${result.mode} totalItems=${result.totalItems}`
        )
      }
    } catch (error) {
      console.error("[ScraperRunner] Worker cycle failed:", error)
    }

    if (cycles < maxCycles) {
      await sleep(intervalMs)
    }
  }
}

if (process.argv[1] && process.argv[1].includes("backend/workers/scraper-worker/runner")) {
  const maxCycles = readPositiveInt(process.env.SCRAPER_RUNNER_MAX_CYCLES, 1)
  const workerIntervalSeconds = readPositiveInt(process.env.SCRAPER_WORKER_INTERVAL_SECONDS, 300)

  runScraperWorkerLoop(
    {
      maxCycles,
      workerIntervalSeconds,
      buildJob: () => buildJobFromEnv(),
    },
  ).catch((error) => {
    console.error("[ScraperRunner] Unhandled error:", error)
    process.exit(1)
  })
}
