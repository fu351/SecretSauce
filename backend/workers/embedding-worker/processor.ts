import {
  embeddingQueueDB,
  type EmbeddingQueueRow,
  type EmbeddingSourceType,
} from "./embedding-queue-db"
import { fetchEmbeddingsFromOllama } from "./ollama-embeddings"
import { canonicalConsolidationDB } from "../../../lib/database/canonical-consolidation-db"
import type { EmbeddingWorkerConfig } from "./config"

interface ResolveBatchResult {
  claimed: number
  completed: number
  failed: number
  dryRunRows?: Array<{
    id: string
    sourceType: EmbeddingSourceType
    sourceId: string
    inputPreview: string
    model: string
  }>
}

export interface EmbeddingQueueRunSummary {
  cycles: number
  totalRequeued: number
  totalClaimed: number
  totalCompleted: number
  totalFailed: number
  dryRunRows?: ResolveBatchResult["dryRunRows"]
}

function previewText(value: string, maxLength = 100): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}


async function resolveBatch(rows: EmbeddingQueueRow[], config: EmbeddingWorkerConfig): Promise<ResolveBatchResult> {
  if (config.dryRun) {
    return {
      claimed: rows.length,
      completed: rows.length,
      failed: 0,
      dryRunRows: rows.map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        inputPreview: previewText(row.input_text),
        model: row.model || config.embeddingModel,
      })),
    }
  }

  const model = config.embeddingModel
  const inputTexts = rows.map((row) => row.input_text)

  // Check canonical_candidate_embeddings for any input_text that has already
  // been embedded, and reuse those vectors to avoid redundant Ollama calls.
  const cachedEmbeddings = await embeddingQueueDB.fetchCandidateEmbeddingsByInputTexts(inputTexts, model)

  const missIndices: number[] = []
  const missTexts: string[] = []
  for (let i = 0; i < rows.length; i++) {
    if (!cachedEmbeddings.has(rows[i].input_text)) {
      missIndices.push(i)
      missTexts.push(rows[i].input_text)
    }
  }

  let ollamaVectors: number[][] = []
  if (missTexts.length > 0) {
    ollamaVectors = await fetchEmbeddingsFromOllama({
      model,
      inputTexts: missTexts,
      timeoutMs: config.requestTimeoutMs,
      baseUrl: config.ollamaBaseUrl,
    })
  }

  const embeddings: number[][] = rows.map((row, i) => {
    const cached = cachedEmbeddings.get(row.input_text)
    if (cached) return cached
    const missPos = missIndices.indexOf(i)
    return ollamaVectors[missPos]
  })

  if (cachedEmbeddings.size > 0) {
    console.log(
      `[EmbeddingQueueResolver] Cache hit: ${cachedEmbeddings.size}/${rows.length} row(s) served from canonical_candidate_embeddings`
    )
  }

  let completed = 0
  let failed = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const embedding = embeddings[index]

    try {
      let writeOk = false
      if (row.source_type === "recipe") {
        writeOk = await embeddingQueueDB.upsertRecipeEmbedding({
          recipeId: row.source_id,
          inputText: row.input_text,
          embedding,
          model: config.embeddingModel,
        })
      } else if (row.source_type === "canonical_candidate") {
        writeOk = await embeddingQueueDB.upsertCandidateEmbedding({
          canonicalName: row.source_id,
          inputText: row.input_text,
          embedding,
          model: config.embeddingModel,
        })
      } else {
        writeOk = await embeddingQueueDB.upsertIngredientEmbedding({
          standardizedIngredientId: row.source_id,
          inputText: row.input_text,
          embedding,
          model: config.embeddingModel,
        })
      }

      if (!writeOk) {
        throw new Error("Embedding write failed.")
      }

      const marked = await embeddingQueueDB.markCompleted(row.id)
      if (!marked) {
        throw new Error("Queue completion update failed.")
      }

      completed += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      await embeddingQueueDB.markFailed(row.id, message)
    }
  }

  return {
    claimed: rows.length,
    completed,
    failed,
  }
}

export interface ProbationEmbeddingRunSummary {
  totalFound: number
  totalEmbedded: number
  totalFailed: number
}

async function runProbationEmbedding(
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
    console.log(`[EmbeddingWorker] [DRY RUN] Would embed ${canonicals.length} canonical(s)`)
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

export type EmbeddingWorkerRunSummary =
  | { mode: "queue"; result: EmbeddingQueueRunSummary }
  | { mode: "probation-embedding"; result: ProbationEmbeddingRunSummary }

export async function runEmbeddingWorker(
  config: EmbeddingWorkerConfig
): Promise<EmbeddingWorkerRunSummary> {
  if (config.mode === "probation-embedding") {
    const result = await runProbationEmbedding(config)
    return { mode: "probation-embedding", result }
  }
  const result = await runEmbeddingQueueResolver(config)
  return { mode: "queue", result }
}

export async function runEmbeddingQueueResolver(config: EmbeddingWorkerConfig): Promise<EmbeddingQueueRunSummary> {
  const mode = config.dryRun ? "[DRY RUN]" : ""
  const modePrefix = mode ? `${mode} ` : ""
  console.log(
    `[EmbeddingQueueResolver] ${modePrefix}Starting run ` +
      `(limit=${config.batchLimit}, source=${config.sourceType}, model=${config.embeddingModel})`
  )

  let cycle = 0
  let totalRequeued = 0
  let totalClaimed = 0
  let totalCompleted = 0
  let totalFailed = 0
  const dryRunRows: ResolveBatchResult["dryRunRows"] = config.dryRun ? [] : undefined

  while (true) {
    if (config.maxCycles > 0 && cycle >= config.maxCycles) {
      console.log(`[EmbeddingQueueResolver] ${modePrefix}Reached max cycle limit (${config.maxCycles})`)
      break
    }

    if (!config.dryRun) {
      const requeued = await embeddingQueueDB.requeueExpired(config.requeueLimit, "Lease expired before completion")
      totalRequeued += requeued
      if (requeued > 0) {
        console.log(`[EmbeddingQueueResolver] ${modePrefix}Requeued ${requeued} expired processing row(s)`)
      }
    }

    console.log(`[EmbeddingQueueResolver] ${modePrefix}Fetch cycle ${cycle + 1}`)
    const rows = config.dryRun
      ? await embeddingQueueDB.fetchPending({
          limit: config.batchLimit,
          sourceType: config.sourceType,
        })
      : await embeddingQueueDB.claimPending({
          limit: config.batchLimit,
          leaseSeconds: config.leaseSeconds,
          sourceType: config.sourceType,
        })

    if (!rows.length) {
      if (cycle === 0) {
        console.log(`[EmbeddingQueueResolver] ${modePrefix}No pending rows`)
      } else {
        console.log(`[EmbeddingQueueResolver] ${modePrefix}Queue drained after ${cycle} cycle(s)`)
      }
      break
    }

    cycle += 1

    try {
      const result = await resolveBatch(rows, config)
      totalClaimed += result.claimed
      totalCompleted += result.completed
      totalFailed += result.failed
      if (config.dryRun && result.dryRunRows && dryRunRows) {
        dryRunRows.push(...result.dryRunRows)
      }

      console.log(
        `[EmbeddingQueueResolver] ${modePrefix}Cycle ${cycle} complete ` +
          `(claimed=${result.claimed}, completed=${result.completed}, failed=${result.failed})`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      totalClaimed += rows.length
      totalFailed += rows.length
      console.error(`[EmbeddingQueueResolver] ${modePrefix}Cycle ${cycle} failed:`, message)

      if (!config.dryRun) {
        await Promise.allSettled(rows.map((row) => embeddingQueueDB.markFailed(row.id, message)))
      }
    }

    if (config.dryRun) {
      console.log(`[EmbeddingQueueResolver] ${modePrefix}Dry run stops after one cycle by design.`)
      break
    }
  }

  if (cycle > 0) {
    console.log(
      `[EmbeddingQueueResolver] ${modePrefix}Completed ${cycle} cycle(s) ` +
        `(requeued=${totalRequeued}, claimed=${totalClaimed}, completed=${totalCompleted}, failed=${totalFailed})`
    )
  }

  return {
    cycles: cycle,
    totalRequeued,
    totalClaimed,
    totalCompleted,
    totalFailed,
    dryRunRows,
  }
}
