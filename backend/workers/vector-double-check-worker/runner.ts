import { getVectorDoubleCheckWorkerConfigFromEnv, type VectorDoubleCheckWorkerConfig } from "./config"
import { runVectorDoubleCheckDiscovery } from "./processor"
import { sleep } from "../env-utils"

export async function runVectorDoubleCheckWorkerLoop(
  overrides?: Partial<VectorDoubleCheckWorkerConfig>
): Promise<void> {
  const config = getVectorDoubleCheckWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runVectorDoubleCheckDiscovery({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[VectorDoubleCheckRunner] Worker cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (process.argv[1] && process.argv[1].includes("queue/vector-double-check-worker/runner")) {
  runVectorDoubleCheckWorkerLoop().catch((error) => {
    console.error("[VectorDoubleCheckRunner] Unhandled error:", error)
    process.exit(1)
  })
}
