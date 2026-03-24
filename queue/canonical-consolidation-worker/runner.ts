import { getCanonicalConsolidationWorkerConfigFromEnv, type CanonicalConsolidationWorkerConfig } from "./config"
import { runCanonicalConsolidation } from "./processor"
import { sleep } from "../env-utils"

export async function runCanonicalConsolidationWorkerLoop(
  overrides?: Partial<CanonicalConsolidationWorkerConfig>
): Promise<void> {
  const config = getCanonicalConsolidationWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runCanonicalConsolidation({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[CanonicalConsolidationRunner] Worker cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (process.argv[1] && process.argv[1].includes("queue/canonical-consolidation-worker/runner")) {
  runCanonicalConsolidationWorkerLoop().catch((error) => {
    console.error("[CanonicalConsolidationRunner] Unhandled error:", error)
    process.exit(1)
  })
}
