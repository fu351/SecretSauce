import { runEmbeddingQueueResolver } from "./queue-mode"
import { runProbationEmbedding } from "./probation-mode"
import type { EmbeddingWorkerConfig } from "./config"

// Re-export mode-specific types so callers don't need to import from the mode files directly.
export type { EmbeddingQueueRunSummary } from "./queue-mode"
export type { ProbationEmbeddingRunSummary } from "./probation-mode"
export { runEmbeddingQueueResolver } from "./queue-mode"

export type EmbeddingWorkerRunSummary =
  | { mode: "queue"; result: import("./queue-mode").EmbeddingQueueRunSummary }
  | { mode: "queue-recipe"; result: import("./queue-mode").EmbeddingQueueRunSummary }
  | { mode: "queue-product"; result: import("./queue-mode").EmbeddingQueueRunSummary }
  | { mode: "queue-all"; result: import("./queue-mode").EmbeddingQueueRunSummary }
  | { mode: "probation-embedding"; result: import("./probation-mode").ProbationEmbeddingRunSummary }

export async function runEmbeddingWorker(
  config: EmbeddingWorkerConfig
): Promise<EmbeddingWorkerRunSummary> {
  if (config.mode === "probation-embedding") {
    const result = await runProbationEmbedding(config)
    return { mode: "probation-embedding", result }
  }
  if (config.mode === "queue-recipe") {
    const result = await runEmbeddingQueueResolver({ ...config, sourceType: "recipe" })
    return { mode: "queue-recipe", result }
  }
  if (config.mode === "queue-product") {
    const result = await runEmbeddingQueueResolver({ ...config, sourceType: "ingredient" })
    return { mode: "queue-product", result }
  }
  if (config.mode === "queue-all") {
    const result = await runEmbeddingQueueResolver({ ...config, sourceType: "any" })
    return { mode: "queue-all", result }
  }
  const result = await runEmbeddingQueueResolver(config)
  return { mode: "queue", result }
}
