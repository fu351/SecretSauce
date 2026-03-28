#!/usr/bin/env tsx

import "dotenv/config"
import { getCanonicalPipelineConfigFromEnv } from "./config"
import { runCanonicalPipeline } from "./pipeline"
import { requireSupabaseEnv } from "../env-utils"

async function main(): Promise<void> {
  requireSupabaseEnv()
  const config = getCanonicalPipelineConfigFromEnv()
  console.log(
    `[CanonicalPipelineResolver] Starting pipeline ` +
      `(dryRun=${config.dryRun}, stopOnStageError=${config.stopOnStageError}, ` +
      `stages=[` +
      `probation-embedding:${config.enableProbationEmbedding}, ` +
      `vector-discovery:${config.enableVectorDiscovery}, ` +
      `consolidation:${config.enableConsolidation}])`
  )

  const summary = await runCanonicalPipeline(config)

  console.log("[CanonicalPipelineResolver] Pipeline complete")
  console.log(JSON.stringify(summary, null, 2))

  if (summary.stageErrors.length > 0) {
    console.error("[CanonicalPipelineResolver] Stage errors:", summary.stageErrors)
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  console.error("[CanonicalPipelineResolver] Unhandled error:", error)
  process.exit(1)
})
