import { getQueueWorkerConfigFromEnv, type QueueWorkerConfig } from "./config"
import { runIngredientQueueResolver, type QueueRunSummary } from "./worker/processor"

function requireSupabaseEnv(): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    )
  }
}

export async function runQueueResolverFromEnv(overrides?: Partial<QueueWorkerConfig>): Promise<QueueRunSummary> {
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
