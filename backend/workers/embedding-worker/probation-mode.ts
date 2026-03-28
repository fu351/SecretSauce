import { embeddingQueueDB } from "./embedding-queue-db"
import { fetchEmbeddingsFromOllama } from "./ollama-embeddings"
import { canonicalConsolidationDB } from "../../../lib/database/canonical-consolidation-db"
import type { EmbeddingWorkerConfig } from "./config"

export interface ProbationEmbeddingRunSummary {
  totalFound: number
  totalEmbedded: number
  totalFailed: number
}

export async function runProbationEmbedding(
  config: EmbeddingWorkerConfig
): Promise<ProbationEmbeddingRunSummary> {
  console.log(
    `[EmbeddingWorker] Probation-embedding mode ` +
      `(model=${config.embeddingModel}, minSources=${config.probationMinDistinctSources}, ` +
      `batchLimit=${config.probationBatchLimit}, dryRun=${config.dryRun})`
  )

  const maxToFetch = config.probationBatchLimit * Math.max(1, config.maxCycles || 1)
  const canonicals = await canonicalConsolidationDB.fetchProbationCanonicalsWithoutEmbedding({
    model: config.embeddingModel,
    limit: maxToFetch,
    minDistinctSources: config.probationMinDistinctSources,
  })

  if (!canonicals.length) {
    console.log("[EmbeddingWorker] No probation canonicals without embeddings")
    return { totalFound: 0, totalEmbedded: 0, totalFailed: 0 }
  }

  console.log(`[EmbeddingWorker] Found ${canonicals.length} probation canonical(s) to embed`)

  if (config.dryRun) {
    console.log(`[EmbeddingWorker] [DRY RUN] Would embed ${canonicals.length} canonical(s):`)
    for (const name of canonicals) {
      console.log(`  - ${name}`)
    }
    return { totalFound: canonicals.length, totalEmbedded: 0, totalFailed: 0 }
  }

  let totalEmbedded = 0
  let totalFailed = 0

  for (let offset = 0; offset < canonicals.length; offset += config.probationBatchLimit) {
    const batch = canonicals.slice(offset, offset + config.probationBatchLimit)

    try {
      const vectors = await fetchEmbeddingsFromOllama({
        model: config.embeddingModel,
        inputTexts: batch,
        timeoutMs: config.requestTimeoutMs,
        baseUrl: config.ollamaBaseUrl,
      })

      for (let i = 0; i < batch.length; i++) {
        const ok = await embeddingQueueDB.upsertCandidateEmbedding({
          canonicalName: batch[i],
          inputText: batch[i],
          embedding: vectors[i],
          model: config.embeddingModel,
        })
        if (ok) {
          totalEmbedded++
        } else {
          totalFailed++
        }
      }

      console.log(
        `[EmbeddingWorker] Embedded batch ${Math.floor(offset / config.probationBatchLimit) + 1}: ` +
          `${batch.length} canonical(s) (total embedded=${totalEmbedded})`
      )
    } catch (error) {
      console.error(`[EmbeddingWorker] Batch embedding failed:`, error)
      totalFailed += batch.length
    }
  }

  console.log(
    `[EmbeddingWorker] Probation embedding done: ` +
      `found=${canonicals.length} embedded=${totalEmbedded} failed=${totalFailed}`
  )

  return { totalFound: canonicals.length, totalEmbedded, totalFailed }
}
