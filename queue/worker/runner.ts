import { getQueueWorkerConfigFromEnv, type QueueWorkerConfig } from "../config"
import { runIngredientQueueResolver } from "./processor"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runQueueWorkerLoop(overrides?: Partial<QueueWorkerConfig>): Promise<void> {
  const config = getQueueWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runIngredientQueueResolver({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[QueueRunner] Worker cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (process.argv[1] && process.argv[1].includes("queue/worker/runner")) {
  runQueueWorkerLoop().catch((error) => {
    console.error("[QueueRunner] Unhandled error:", error)
    process.exit(1)
  })
}
