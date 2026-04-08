import type { CanonicalMedoidWorkerConfig } from "../../workers/canonical-medoid-worker/config"
import { getCanonicalMedoidWorkerConfigFromEnv } from "../../workers/canonical-medoid-worker/config"
import { runCanonicalMedoidWorker } from "../../workers/canonical-medoid-worker/processor"
import { sleep } from "../../workers/env-utils"

export async function runCanonicalMedoidPipelineRunner(
  overrides?: Partial<CanonicalMedoidWorkerConfig>
): Promise<void> {
  const config = getCanonicalMedoidWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runCanonicalMedoidWorker({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[CanonicalMedoidPipelineRunner] Pipeline cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+canonical-medoid-pipeline[\\/]+runner(?:\.ts)?$/i.test(process.argv[1])
) {
  runCanonicalMedoidPipelineRunner().catch((error) => {
    console.error("[CanonicalMedoidPipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
