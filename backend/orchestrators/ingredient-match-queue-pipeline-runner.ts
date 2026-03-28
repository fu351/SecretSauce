import { getQueueWorkerConfigFromEnv, type QueueWorkerConfig } from "../workers/config"
import { sleep } from "../workers/env-utils"
import { runIngredientQueueResolver } from "../workers/ingredient-worker/processor"

export async function runIngredientMatchQueuePipelineRunner(
  overrides?: Partial<QueueWorkerConfig>
): Promise<void> {
  const config = getQueueWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runIngredientQueueResolver({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[IngredientMatchQueuePipelineRunner] Pipeline cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (
  process.argv[1] &&
  process.argv[1].includes("backend/orchestrators/ingredient-match-queue-pipeline-runner")
) {
  runIngredientMatchQueuePipelineRunner().catch((error) => {
    console.error("[IngredientMatchQueuePipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
