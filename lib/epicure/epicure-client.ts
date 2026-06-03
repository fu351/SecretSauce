import { getPythonApiBaseUrl } from "@/backend/orchestrators/python-api-pipeline/config"
import type { CuisineBlendParams, SwapSuggestion } from "./types"

const DEFAULT_TIMEOUT_MS = 20_000

/** Raised when the python service URL is not configured. */
export class EpicureUnavailableError extends Error {
  constructor(message = "Epicure service URL not configured") {
    super(message)
    this.name = "EpicureUnavailableError"
  }
}

/** Raised when the epicure backend responds with a non-2xx status or bad payload. */
export class EpicureRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = "EpicureRequestError"
  }
}

interface EpicureEnvelope {
  success?: boolean
  data?: unknown
  error?: string | null
}

function isSwapSuggestion(value: unknown): value is SwapSuggestion {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.ingredient === "string" &&
    typeof candidate.token === "string" &&
    typeof candidate.score === "number"
  )
}

function requireBaseUrl(): string {
  const baseUrl = getPythonApiBaseUrl()
  if (!baseUrl) {
    throw new EpicureUnavailableError()
  }
  return baseUrl
}

async function readEnvelope(response: Response): Promise<SwapSuggestion[]> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new EpicureRequestError(detail || `Epicure request failed (${response.status})`, response.status)
  }

  let payload: EpicureEnvelope
  try {
    payload = (await response.json()) as EpicureEnvelope
  } catch {
    throw new EpicureRequestError("Epicure response was not valid JSON")
  }

  if (payload.success === false) {
    throw new EpicureRequestError(payload.error || "Epicure request failed")
  }
  // Validate each element at the boundary so malformed rows can't poison ranking math.
  return Array.isArray(payload.data) ? payload.data.filter(isSwapSuggestion) : []
}

function withTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, done: () => clearTimeout(id) }
}

/** Fetch blended ingredient swaps (chemistry + recipe-context) from the backend. */
export async function getEpicureSwaps(
  ingredient: string,
  { k }: { k?: number }
): Promise<SwapSuggestion[]> {
  const baseUrl = requireBaseUrl()
  const params = new URLSearchParams({ ingredient })
  if (k !== undefined) params.set("k", String(k))

  const { signal, done } = withTimeout()
  try {
    const response = await fetch(`${baseUrl}/epicure/swap?${params.toString()}`, { signal })
    return await readEnvelope(response)
  } finally {
    done()
  }
}

/** Fetch single-model nearest neighbours for an ingredient. */
export async function getEpicureNeighbors(
  ingredient: string,
  { k, model }: { k?: number; model?: string } = {}
): Promise<SwapSuggestion[]> {
  const baseUrl = requireBaseUrl()
  const params = new URLSearchParams({ ingredient })
  if (k !== undefined) params.set("k", String(k))
  if (model) params.set("model", model)

  const { signal, done } = withTimeout()
  try {
    const response = await fetch(`${baseUrl}/epicure/neighbors?${params.toString()}`, { signal })
    return await readEnvelope(response)
  } finally {
    done()
  }
}

/** Fetch cuisine-directed suggestions by rotating an ingredient toward a cuisine pole. */
export async function getEpicureCuisineBlend(
  params: CuisineBlendParams
): Promise<SwapSuggestion[]> {
  const baseUrl = requireBaseUrl()
  const body: Record<string, unknown> = { ingredient: params.ingredient, cuisine: params.cuisine }
  if (params.thetaDeg !== undefined) body.theta_deg = params.thetaDeg
  if (params.k !== undefined) body.k = params.k
  if (params.model !== undefined) body.model = params.model

  const { signal, done } = withTimeout()
  try {
    const response = await fetch(`${baseUrl}/epicure/cuisine-blend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
    return await readEnvelope(response)
  } finally {
    done()
  }
}
