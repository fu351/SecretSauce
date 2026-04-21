#!/usr/bin/env tsx

import "dotenv/config"
import { getMABReallocationConfigFromEnv, requirePosthogEnv } from "../../workers/mab-reallocation-worker/config"
import { runMABReallocationWorker } from "../../workers/mab-reallocation-worker/processor"
import type { MABRunSummary } from "../../workers/mab-reallocation-worker/processor"
import type { MABReallocationConfig } from "../../workers/mab-reallocation-worker/config"

export async function runMABReallocationPipeline(
  overrides?: Partial<MABReallocationConfig>
): Promise<MABRunSummary> {
  requirePosthogEnv()
  return runMABReallocationWorker(getMABReallocationConfigFromEnv(overrides))
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+mab-reallocation-pipeline[\\/]+pipeline(?:\.ts)?$/i.test(
    process.argv[1]
  )
) {
  runMABReallocationPipeline().catch((error: unknown) => {
    console.error("[MABPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
