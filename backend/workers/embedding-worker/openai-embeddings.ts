const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"

interface EmbeddingApiResponse {
  data?: Array<{
    embedding?: number[]
    index?: number
  }>
}

/**
 * Fetches embeddings for one or more texts from the OpenAI API.
 */
export async function fetchEmbeddings(params: {
  model: string
  inputTexts: string[]
  timeoutMs: number
}): Promise<number[][]> {
  if (params.inputTexts.length === 0) return []

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY; embedding generation is unavailable.")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, params.timeoutMs))

  try {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        input: params.inputTexts,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const responseText = await response.text()
      throw new Error(`Embedding API error (${response.status}): ${responseText.slice(0, 500)}`)
    }

    const payload = (await response.json()) as EmbeddingApiResponse
    if (!Array.isArray(payload.data)) {
      throw new Error("Embedding API returned an invalid payload (missing data array).")
    }

    const orderedVectors = new Array<number[] | undefined>(params.inputTexts.length)
    for (const item of payload.data) {
      const index = typeof item.index === "number" ? item.index : -1
      if (index < 0 || index >= params.inputTexts.length || !Array.isArray(item.embedding)) {
        throw new Error("Embedding API returned invalid row index or embedding value.")
      }
      orderedVectors[index] = item.embedding
    }

    const missingIndexes: number[] = []
    const vectors = orderedVectors.map((vector, index) => {
      if (Array.isArray(vector)) return vector
      missingIndexes.push(index)
      return []
    })

    if (missingIndexes.length > 0) {
      throw new Error(`Embedding API response missing ${missingIndexes.length} vector(s).`)
    }

    return vectors
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`Embedding API request timed out after ${params.timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
