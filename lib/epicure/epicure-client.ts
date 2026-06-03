import { getPythonApiBaseUrl } from "@/backend/orchestrators/python-api-pipeline/config"
import type { CuisineBlendParams, EpicureModelName, SwapSuggestion } from "./types"

const DEFAULT_TIMEOUT_MS = 20_000

const KNOWN_MODELS: readonly EpicureModelName[] = ["core", "chem", "cooc"]

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

/** True when an error is an `AbortError` (request timeout). Shared with API routes. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

interface EpicureEnvelope {
  success?: boolean
  data?: unknown
  error?: string | null
}

/** Validate the response is a JSON object envelope (not an array / scalar). */
function isEpicureEnvelope(value: unknown): value is EpicureEnvelope {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isModelName(value: unknown): value is EpicureModelName {
  return typeof value === "string" && (KNOWN_MODELS as readonly string[]).includes(value)
}

function isSwapSuggestion(value: unknown): value is SwapSuggestion {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.ingredient !== "string") return false
  if (typeof candidate.token !== "string") return false
  // Reject NaN/Infinity so malformed scores can't poison ranking math.
  if (typeof candidate.score !== "number" || !Number.isFinite(candidate.score)) return false
  if (candidate.sources !== undefined) {
    if (!Array.isArray(candidate.sources) || !candidate.sources.every(isModelName)) return false
  }
  return true
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

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new EpicureRequestError("Epicure response was not valid JSON")
  }

  // Validate the envelope shape at the boundary; a malformed body must surface
  // as an error rather than silently degrading to an empty result set.
  if (!isEpicureEnvelope(parsed)) {
    throw new EpicureRequestError("Unexpected Epicure response shape")
  }

  if (parsed.success === false) {
    throw new EpicureRequestError(parsed.error || "Epicure request failed")
  }
  // Validate each element at the boundary so malformed rows can't poison ranking math.
  return Array.isArray(parsed.data) ? parsed.data.filter(isSwapSuggestion) : []
}

function withTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, done: () => clearTimeout(id) }
}

/** Shared GET request + envelope read with a per-request timeout. */
async function getRequest(path: string, params: URLSearchParams): Promise<SwapSuggestion[]> {
  const baseUrl = requireBaseUrl()
  const { signal, done } = withTimeout()
  try {
    const response = await fetch(`${baseUrl}${path}?${params.toString()}`, { signal })
    return await readEnvelope(response)
  } finally {
    done()
  }
}

/** Fetch blended ingredient swaps (chemistry + core models) from the backend. */
export async function getEpicureSwaps(
  ingredient: string,
  { k }: { k?: number }
): Promise<SwapSuggestion[]> {
  const params = new URLSearchParams({ ingredient })
  if (k !== undefined) params.set("k", String(k))
  return getRequest("/epicure/swap", params)
}

/** Fetch single-model nearest neighbours for an ingredient. */
export async function getEpicureNeighbors(
  ingredient: string,
  { k, model }: { k?: number; model?: EpicureModelName } = {}
): Promise<SwapSuggestion[]> {
  const params = new URLSearchParams({ ingredient })
  if (k !== undefined) params.set("k", String(k))
  if (model) params.set("model", model)
  return getRequest("/epicure/neighbors", params)
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
