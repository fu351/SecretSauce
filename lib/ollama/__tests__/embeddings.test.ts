import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchEmbeddingsFromOllama } from "../embeddings"

const OLLAMA_BASE_URL = "http://localhost:11434"
const MODEL = "nomic-embed-text"

describe("fetchEmbeddingsFromOllama", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("returns empty array for empty input", async () => {
    const result = await fetchEmbeddingsFromOllama({
      model: MODEL,
      inputTexts: [],
      timeoutMs: 5000,
      baseUrl: OLLAMA_BASE_URL,
    })
    expect(result).toEqual([])
  })

  it("returns ordered vectors for valid response", async () => {
    const vectors = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: vectors }),
      })
    )

    const result = await fetchEmbeddingsFromOllama({
      model: MODEL,
      inputTexts: ["tomato", "onion"],
      timeoutMs: 5000,
      baseUrl: OLLAMA_BASE_URL,
    })

    expect(result).toEqual(vectors)
    expect(fetch).toHaveBeenCalledWith(
      `${OLLAMA_BASE_URL}/api/embed`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: MODEL, input: ["tomato", "onion"] }),
      })
    )
  })

  it("strips trailing slash from baseUrl", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1]] }),
      })
    )

    await fetchEmbeddingsFromOllama({
      model: MODEL,
      inputTexts: ["test"],
      timeoutMs: 5000,
      baseUrl: "http://localhost:11434/",
    })

    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/embed", expect.anything())
  })

  it("throws on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "model not found",
      })
    )

    await expect(
      fetchEmbeddingsFromOllama({
        model: MODEL,
        inputTexts: ["tomato"],
        timeoutMs: 5000,
        baseUrl: OLLAMA_BASE_URL,
      })
    ).rejects.toThrow("Ollama embedding API error (500): model not found")
  })

  it("throws when embeddings array is missing from payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })
    )

    await expect(
      fetchEmbeddingsFromOllama({
        model: MODEL,
        inputTexts: ["tomato"],
        timeoutMs: 5000,
        baseUrl: OLLAMA_BASE_URL,
      })
    ).rejects.toThrow("missing embeddings array")
  })

  it("throws when vector count does not match input count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2]] }),
      })
    )

    await expect(
      fetchEmbeddingsFromOllama({
        model: MODEL,
        inputTexts: ["tomato", "onion"],
        timeoutMs: 5000,
        baseUrl: OLLAMA_BASE_URL,
      })
    ).rejects.toThrow("returned 1 vector(s) for 2 input(s)")
  })

  it("throws descriptive message on timeout", async () => {
    vi.useRealTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted")
              err.name = "AbortError"
              reject(err)
            })
          })
      )
    )

    await expect(
      fetchEmbeddingsFromOllama({
        model: MODEL,
        inputTexts: ["tomato"],
        timeoutMs: 50,
        baseUrl: OLLAMA_BASE_URL,
      })
    ).rejects.toThrow("timed out after 50ms")
  }, 2000)
})
