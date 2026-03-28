import { getCanonicalConsolidationWorkerConfigFromEnv, type CanonicalConsolidationWorkerConfig } from "../../workers/canonical-consolidation-worker/config"
import { runCanonicalConsolidation } from "../../workers/canonical-consolidation-worker/processor"
import { sleep } from "../../workers/env-utils"

export async function runCanonicalConsolidationPipelineRunner(
  overrides?: Partial<CanonicalConsolidationWorkerConfig>
): Promise<void> {
  const config = getCanonicalConsolidationWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runCanonicalConsolidation({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[CanonicalConsolidationPipelineRunner] Pipeline cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+canonical-consolidation-pipeline[\\/]+runner(?:\.ts)?$/i.test(process.argv[1])
) {
  runCanonicalConsolidationPipelineRunner().catch((error) => {
    console.error("[CanonicalConsolidationPipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
