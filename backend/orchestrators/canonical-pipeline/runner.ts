import { getCanonicalPipelineConfigFromEnv, type CanonicalPipelineConfig } from "./config"
import { runCanonicalPipeline } from "./pipeline"
import { sleep } from "../../workers/env-utils"

export async function runCanonicalPipelineRunner(
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

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+canonical-pipeline[\\/]+runner(?:\.ts)?$/i.test(process.argv[1])
) {
  runCanonicalPipelineRunner().catch((error) => {
    console.error("[CanonicalPipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
