interface OllamaEmbedResponse {
  embeddings?: number[][]
}

/**
 * Fetches embeddings for one or more texts from a local Ollama instance.
 */
export async function fetchEmbeddingsFromOllama(params: {
  model: string
  inputTexts: string[]
  timeoutMs: number
  baseUrl: string
}): Promise<number[][]> {
  if (params.inputTexts.length === 0) return []

  const url = `${params.baseUrl.replace(/\/$/, "")}/api/embed`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, params.timeoutMs))

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        input: params.inputTexts,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const responseText = await response.text()
      throw new Error(`Ollama embedding API error (${response.status}): ${responseText.slice(0, 500)}`)
    }

    const payload = (await response.json()) as OllamaEmbedResponse
    if (!Array.isArray(payload.embeddings)) {
      throw new Error("Ollama embedding API returned an invalid payload (missing embeddings array).")
    }

    if (payload.embeddings.length !== params.inputTexts.length) {
      throw new Error(
        `Ollama embedding API returned ${payload.embeddings.length} vector(s) for ${params.inputTexts.length} input(s).`
      )
    }

    for (let i = 0; i < payload.embeddings.length; i += 1) {
      if (!Array.isArray(payload.embeddings[i])) {
        throw new Error(`Ollama embedding API returned invalid vector at index ${i}.`)
      }
    }

    return payload.embeddings
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`Ollama embedding API request timed out after ${params.timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
