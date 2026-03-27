import {
  embeddingQueueDB,
  type EmbeddingQueueRow,
  type EmbeddingSourceType,
} from "./embedding-queue-db"
import { fetchEmbeddingsFromOllama } from "./ollama-embeddings"
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

  const embeddings = await fetchEmbeddingsFromOllama({
    model: config.embeddingModel,
    inputTexts: rows.map((row) => row.input_text),
    timeoutMs: config.requestTimeoutMs,
    baseUrl: config.ollamaBaseUrl,
  })

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
