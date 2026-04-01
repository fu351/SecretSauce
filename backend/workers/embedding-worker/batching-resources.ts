import { fetchEmbeddingsFromOllama } from "./ollama-embeddings"

export const DEFAULT_EMBEDDING_BATCH_MAX_CHARS = 12000

export interface EmbeddingBatchResourcePlan {
  startIndex: number
  inputTexts: string[]
  estimatedChars: number
}

interface EmbeddingBatchPlannerOptions {
  maxItems: number
  maxChars?: number
}

interface FetchEmbeddingsWithResourcePlanParams {
  model: string
  inputTexts: string[]
  timeoutMs: number
  baseUrl: string
  maxItems: number
  maxChars?: number
  logPrefix?: string
}

function estimateTextChars(value: string): number {
  const normalized = value.replace(/\s+/g, " ").trim()
  return Math.max(1, normalized.length)
}

export function buildEmbeddingBatchResourcePlan(
  inputTexts: string[],
  options: EmbeddingBatchPlannerOptions
): EmbeddingBatchResourcePlan[] {
  if (inputTexts.length === 0) return []

  const maxItems = Math.max(1, options.maxItems)
  const maxChars = Math.max(1, options.maxChars ?? DEFAULT_EMBEDDING_BATCH_MAX_CHARS)

  const plan: EmbeddingBatchResourcePlan[] = []
  let currentTexts: string[] = []
  let currentStartIndex = 0
  let currentChars = 0

  const flush = () => {
    if (currentTexts.length === 0) return
    plan.push({
      startIndex: currentStartIndex,
      inputTexts: currentTexts,
      estimatedChars: currentChars,
    })
    currentTexts = []
    currentChars = 0
  }

  for (let index = 0; index < inputTexts.length; index += 1) {
    const text = inputTexts[index]
    const estimatedChars = estimateTextChars(text)

    if (currentTexts.length === 0) {
      currentStartIndex = index
      currentTexts.push(text)
      currentChars = estimatedChars
      continue
    }

    const wouldExceedItems = currentTexts.length >= maxItems
    const wouldExceedChars = currentChars + estimatedChars > maxChars

    if (wouldExceedItems || wouldExceedChars) {
      flush()
      currentStartIndex = index
      currentTexts.push(text)
      currentChars = estimatedChars
      continue
    }

    currentTexts.push(text)
    currentChars += estimatedChars
  }

  flush()
  return plan
}

export async function fetchEmbeddingsWithResourcePlan(
  params: FetchEmbeddingsWithResourcePlanParams
): Promise<number[][]> {
  if (params.inputTexts.length === 0) return []

  const plan = buildEmbeddingBatchResourcePlan(params.inputTexts, {
    maxItems: params.maxItems,
    maxChars: params.maxChars,
  })

  if (plan.length > 1) {
    const prefix = params.logPrefix ? `${params.logPrefix} ` : ""
    console.log(
      `${prefix}Splitting ${params.inputTexts.length} input(s) across ${plan.length} Ollama batch(es)`
    )
  }

  const vectors: number[][] = []
  for (const batch of plan) {
    const batchVectors = await fetchEmbeddingsFromOllama({
      model: params.model,
      inputTexts: batch.inputTexts,
      timeoutMs: params.timeoutMs,
      baseUrl: params.baseUrl,
    })
    vectors.push(...batchVectors)
  }

  return vectors
}
