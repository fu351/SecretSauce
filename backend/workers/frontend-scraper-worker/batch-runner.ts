import { sleep } from "../env-utils"
import {
  runFrontendBatchScraperProcessor,
} from "./batch-processor"
import type { FrontendBatchScraperProcessorInput } from "./batch-utils"

export interface FrontendBatchScraperRunnerConfig {
  workerIntervalSeconds: number
  maxCycles: number
  buildJob: (cycle: number) => Promise<FrontendBatchScraperProcessorInput | null> | FrontendBatchScraperProcessorInput | null
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function parseIngredientsJson(value: string | undefined): FrontendBatchScraperProcessorInput["ingredients"] {
  const raw = String(value ?? "").trim()
  if (!raw) {
    throw new Error("BATCH_SCRAPER_RUNNER_INGREDIENTS_JSON is required")
  }

  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("BATCH_SCRAPER_RUNNER_INGREDIENTS_JSON must be a non-empty JSON array")
  }

  return parsed
}

function parseStoresCsv(value: string | undefined): string[] | undefined {
  const raw = String(value ?? "").trim()
  if (!raw) return undefined

  const stores = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  return stores.length > 0 ? stores : undefined
}

function buildJobFromEnv(): FrontendBatchScraperProcessorInput {
  const zipCode = String(process.env.BATCH_SCRAPER_RUNNER_ZIP_CODE ?? "").trim()
  if (!zipCode) {
    throw new Error("BATCH_SCRAPER_RUNNER_ZIP_CODE is required")
  }

  return {
    ingredients: parseIngredientsJson(process.env.BATCH_SCRAPER_RUNNER_INGREDIENTS_JSON),
    zipCode,
    forceRefresh: process.env.BATCH_SCRAPER_RUNNER_FORCE_REFRESH === "true",
    stores: parseStoresCsv(process.env.BATCH_SCRAPER_RUNNER_STORES_CSV),
  }
}

export async function runFrontendBatchScraperWorkerLoop(config: FrontendBatchScraperRunnerConfig): Promise<void> {
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000
  const maxCycles = config.maxCycles > 0 ? config.maxCycles : Infinity
  let cycles = 0

  while (cycles < maxCycles) {
    cycles += 1

    try {
      const job = await config.buildJob(cycles)
      if (!job) {
        console.log(`[FrontendBatchRunner] Cycle ${cycles}: no job returned`)
      } else {
        const output = await runFrontendBatchScraperProcessor(job)
        console.log(
          `[FrontendBatchRunner] Cycle ${cycles}: ingredients=${output.summary.totalIngredients} ` +
            `success=${output.summary.successful}/${output.summary.totalAttempts} ` +
            `cached=${output.summary.cached} scraped=${output.summary.scraped} failed=${output.summary.failed}`
        )
      }
    } catch (error) {
      console.error("[FrontendBatchRunner] Worker cycle failed:", error)
    }

    if (cycles < maxCycles) {
      await sleep(intervalMs)
    }
  }
}

if (process.argv[1] && process.argv[1].includes("backend/workers/frontend-scraper-worker/batch-runner")) {
  const maxCycles = readPositiveInt(process.env.BATCH_SCRAPER_RUNNER_MAX_CYCLES, 1)
  const workerIntervalSeconds = readPositiveInt(process.env.BATCH_SCRAPER_RUNNER_INTERVAL_SECONDS, 300)

  runFrontendBatchScraperWorkerLoop({
    maxCycles,
    workerIntervalSeconds,
    buildJob: () => buildJobFromEnv(),
  }).catch((error) => {
    console.error("[FrontendBatchRunner] Unhandled error:", error)
    process.exit(1)
  })
}
