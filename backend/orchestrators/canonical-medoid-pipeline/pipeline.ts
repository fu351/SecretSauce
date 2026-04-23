#!/usr/bin/env tsx

import "../../scripts/load-env"
import type { CanonicalMedoidRunSummary } from "../../workers/canonical-medoid-worker/processor"
import type { CanonicalMedoidWorkerConfig } from "../../workers/canonical-medoid-worker/config"
import { getCanonicalMedoidWorkerConfigFromEnv } from "../../workers/canonical-medoid-worker/config"
import { runCanonicalMedoidWorker } from "../../workers/canonical-medoid-worker/processor"
import { requireSupabaseEnv } from "../../workers/env-utils"

export async function runCanonicalMedoidPipeline(
  overrides?: Partial<CanonicalMedoidWorkerConfig>
): Promise<CanonicalMedoidRunSummary> {
  requireSupabaseEnv()
  return runCanonicalMedoidWorker(getCanonicalMedoidWorkerConfigFromEnv(overrides))
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+canonical-medoid-pipeline[\\/]+pipeline(?:\.ts)?$/i.test(process.argv[1])
) {
  runCanonicalMedoidPipeline().catch((error: unknown) => {
    console.error("[CanonicalMedoidPipeline] Unhandled error:", error)
    process.exit(1)
  })
}
