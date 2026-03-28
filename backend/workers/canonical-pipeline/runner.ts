import { getCanonicalPipelineConfigFromEnv, type CanonicalPipelineConfig } from "./config"
import { runCanonicalPipeline } from "./pipeline"
import { sleep } from "../env-utils"

export async function runCanonicalPipelineWorkerLoop(
  overrides?: Partial<CanonicalPipelineConfig>
): Promise<void> {
  const config = getCanonicalPipelineConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runCanonicalPipeline(config)
    } catch (error) {
      console.error("[CanonicalPipelineRunner] Pipeline cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (process.argv[1] && process.argv[1].includes("backend/workers/canonical-pipeline/runner")) {
  runCanonicalPipelineWorkerLoop().catch((error) => {
    console.error("[CanonicalPipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
