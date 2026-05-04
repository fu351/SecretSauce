import type { RecipeImportResponse } from "@/lib/types"
import { getPythonApiBaseUrl } from "./config"

export type PythonRecipeImportEndpoint = "url" | "instagram" | "text"

export interface PythonApiPipelineResult<TBody = RecipeImportResponse> {
  status: number
  body: TBody
}

export interface PythonApiPipelineOptions {
  timeoutMs?: number
  unavailableMessage?: string
  mapUnsuccessfulResponseToStatus?: number
}

const DEFAULT_TIMEOUT_MS = 90_000

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function isNetworkLikeError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    isAbortError(error) ||
    (error instanceof Error && /fetch|network|ECONNREFUSED|ETIMEDOUT/i.test(error.message))
  )
}

function getDetailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return null
  }

  const detail = (payload as Record<string, unknown>).detail
  return typeof detail === "string" ? detail : null
}

export async function runPythonRecipeImportPipeline(
  endpoint: PythonRecipeImportEndpoint,
  payload: Record<string, unknown>,
  options: PythonApiPipelineOptions = {}
): Promise<PythonApiPipelineResult> {
  const baseUrl = getPythonApiBaseUrl()
  if (!baseUrl) {
    return {
      status: 503,
      body: {
        success: false,
        error: options.unavailableMessage || "Python service URL not configured",
      },
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/recipe-import/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeoutId)
    const timeoutMessage = "Import took too long. Try a different source or try again later."

    return {
      status: 503,
      body: {
        success: false,
        error: isNetworkLikeError(error)
          ? isAbortError(error)
            ? timeoutMessage
            : "Could not reach the import service. Please check your connection and try again."
          : error instanceof Error
            ? error.message
            : "Request failed.",
      },
    }
  }
  clearTimeout(timeoutId)

  const contentType = response.headers.get("content-type") ?? ""
  const text = await response.text()
  let parsedBody: unknown = null

  try {
    parsedBody = contentType.includes("application/json") && text
      ? JSON.parse(text)
      : { success: false, error: text || "No response from import service." }
  } catch {
    return {
      status: response.ok ? 502 : response.status,
      body: {
        success: false,
        error: response.ok
          ? "Invalid response from import service. Please try again."
          : text || "Import service error. Please try again later.",
      },
    }
  }

  const body = parsedBody as RecipeImportResponse

  if (!response.ok) {
    const message =
      body?.error ||
      getDetailMessage(parsedBody) ||
      text ||
      "Import service unavailable. Please try again later."

    return {
      status: response.status >= 500 ? 502 : response.status,
      body: { success: false, error: message },
    }
  }

  if (!body.success && body.error && options.mapUnsuccessfulResponseToStatus) {
    return {
      status: options.mapUnsuccessfulResponseToStatus,
      body,
    }
  }

  return {
    status: 200,
    body,
  }
}
