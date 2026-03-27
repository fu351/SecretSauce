import { sleep } from "../env-utils"
import type { IngredientStandardizationInput } from "./ingredient-standardizer"
import type { UnitStandardizationInput } from "./unit-standardizer"
import { runStandardizerProcessor, type StandardizerProcessorJob } from "./processor"

export interface StandardizerRunnerConfig {
  workerIntervalSeconds: number
  maxCycles: number
  buildJob: (cycle: number) => Promise<StandardizerProcessorJob | null> | StandardizerProcessorJob | null
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function parseRunnerMode(value: string | undefined): "ingredient" | "unit" {
  const normalized = String(value ?? "").trim().toLowerCase()
  return normalized === "unit" ? "unit" : "ingredient"
}

function parseJsonArray(value: string | undefined): unknown[] {
  const raw = String(value ?? "").trim()
  if (!raw) return []
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error("STANDARDIZER_RUNNER_INPUTS_JSON must be a JSON array")
  }
  return parsed
}

function buildJobFromEnv(): StandardizerProcessorJob {
  const mode = parseRunnerMode(process.env.STANDARDIZER_RUNNER_MODE)
  const rawInputs = parseJsonArray(process.env.STANDARDIZER_RUNNER_INPUTS_JSON)

  if (mode === "ingredient") {
    const inputs = rawInputs.map((item, index) => {
      const row = item as Partial<IngredientStandardizationInput>
      return {
        id: String(row.id ?? index),
        name: String(row.name ?? ""),
        amount: row.amount,
        unit: row.unit,
        vectorCandidates: Array.isArray(row.vectorCandidates)
          ? row.vectorCandidates.map((candidate) => String(candidate))
          : undefined,
      } satisfies IngredientStandardizationInput
    })

    return {
      mode,
      context: process.env.STANDARDIZER_RUNNER_CONTEXT,
      inputs,
    }
  }

  const inputs = rawInputs.map((item, index) => {
    const row = item as Partial<UnitStandardizationInput>
    return {
      id: String(row.id ?? index),
      rawProductName: String(row.rawProductName ?? ""),
      cleanedName: row.cleanedName ?? null,
      rawUnit: row.rawUnit ?? null,
      source: row.source === "recipe" ? "recipe" : "scraper",
      knownIngredientCanonicalName: row.knownIngredientCanonicalName ?? null,
    } satisfies UnitStandardizationInput
  })

  return {
    mode,
    inputs,
  }
}

export async function runStandardizerWorkerLoop(config: StandardizerRunnerConfig): Promise<void> {
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000
  const maxCycles = config.maxCycles > 0 ? config.maxCycles : Infinity
  let cycles = 0

  while (cycles < maxCycles) {
    cycles += 1

    try {
      const job = await config.buildJob(cycles)
      if (!job) {
        console.log(`[StandardizerRunner] Cycle ${cycles}: no job returned`)
      } else {
        const result = await runStandardizerProcessor(job)
        console.log(
          `[StandardizerRunner] Cycle ${cycles}: mode=${result.mode} ` +
            `requested=${result.summary.requested} succeeded=${result.summary.succeeded} failed=${result.summary.failed}`
        )
      }
    } catch (error) {
      console.error("[StandardizerRunner] Worker cycle failed:", error)
    }

    if (cycles < maxCycles) {
      await sleep(intervalMs)
    }
  }
}

if (process.argv[1] && process.argv[1].includes("backend/workers/standardizer-worker/runner")) {
  const maxCycles = readPositiveInt(process.env.STANDARDIZER_RUNNER_MAX_CYCLES, 1)
  const workerIntervalSeconds = readPositiveInt(process.env.STANDARDIZER_WORKER_INTERVAL_SECONDS, 300)

  runStandardizerWorkerLoop({
    maxCycles,
    workerIntervalSeconds,
    buildJob: () => buildJobFromEnv(),
  }).catch((error) => {
    console.error("[StandardizerRunner] Unhandled error:", error)
    process.exit(1)
  })
}
