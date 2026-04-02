#!/usr/bin/env tsx

import "dotenv/config"
import { getQueueWorkerConfigFromEnv, type QueueWorkerConfig } from "../../workers/config"
import { runIngredientQueueResolver, type QueueRunSummary } from "../../workers/ingredient-worker/processor"
import { requireSupabaseEnv } from "../../workers/env-utils"

export async function runIngredientMatchQueuePipeline(
  overrides?: Partial<QueueWorkerConfig>
): Promise<QueueRunSummary> {
  requireSupabaseEnv()
  const config = getQueueWorkerConfigFromEnv(overrides)
  const summary = await runIngredientQueueResolver(config)

  if (config.dryRun && summary.cycles > 0) {
    console.log("\n========== DRY RUN RESULTS ==========")
    console.log(
      JSON.stringify(
        {
          summary: {
            totalProcessed: summary.totalResolved + summary.totalFailed,
            resolved: summary.totalResolved,
            failed: summary.totalFailed,
            unitMetrics: summary.unitMetrics,
          },
          results: summary.dryRunResults || [],
        },
        null,
        2
      )
    )
    console.log("=====================================\n")
  }

  return summary
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+ingredient-match-queue-pipeline[\\/]+pipeline(?:\.ts)?$/i.test(process.argv[1])
) {
  runIngredientMatchQueuePipeline().catch((error: unknown) => {
    console.error("[IngredientMatchQueuePipeline] Unhandled error:", error)
    process.exit(1)
  })
}
