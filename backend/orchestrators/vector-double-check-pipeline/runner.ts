import { getVectorDoubleCheckWorkerConfigFromEnv, type VectorDoubleCheckWorkerConfig } from "../../workers/vector-double-check-worker/config"
import { runVectorDoubleCheckPipeline } from "./pipeline"
import { sleep } from "../../workers/env-utils"

export async function runVectorDoubleCheckPipelineRunner(
  overrides?: Partial<VectorDoubleCheckWorkerConfig>
): Promise<void> {
  const config = getVectorDoubleCheckWorkerConfigFromEnv(overrides)
  const intervalMs = Math.max(1, config.workerIntervalSeconds) * 1000

  while (true) {
    try {
      await runVectorDoubleCheckPipeline({ ...config, maxCycles: 1 })
    } catch (error) {
      console.error("[VectorDoubleCheckPipelineRunner] Pipeline cycle failed:", error)
    }

    await sleep(intervalMs)
  }
}

if (
  process.argv[1] &&
  /backend[\\/]+orchestrators[\\/]+vector-double-check-pipeline[\\/]+runner(?:\.ts)?$/i.test(process.argv[1])
) {
  runVectorDoubleCheckPipelineRunner().catch((error) => {
    console.error("[VectorDoubleCheckPipelineRunner] Unhandled error:", error)
    process.exit(1)
  })
}
