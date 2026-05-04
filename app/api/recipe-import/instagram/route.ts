import { NextRequest, NextResponse } from "next/server"
import type { RecipeImportResponse } from "@/lib/types"
import { runPythonRecipeImportPipeline } from "@/backend/orchestrators/python-api-pipeline/pipeline"

/** Matches instagram.com post/reel/tv shortcode; allows www, m., or no subdomain */
const INSTAGRAM_URL_REGEX =
  /https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]{5,})(?:\/|\?|$)/i

const FETCH_TIMEOUT_MS = 90_000

function normalizeAndValidateUrl(input: unknown): { url: string } | { error: string } {
  if (input === null || input === undefined) {
    return { error: "Instagram URL is required" }
  }
  const raw = typeof input === "string" ? input : String(input)
  const trimmed = raw.trim()
  if (!trimmed) {
    return { error: "Instagram URL is required" }
  }
  const firstLine = trimmed.split(/\s/)[0]
  const normalized = firstLine.replace(/#.*$/, "").replace(/\?.*$/, (q) => {
    const params = new URLSearchParams(q.slice(1))
    params.delete("utm_source")
    params.delete("utm_medium")
    params.delete("utm_campaign")
    const rest = params.toString()
    return rest ? `?${rest}` : ""
  })
  if (!/^https?:\/\//i.test(normalized)) {
    return { error: "Please provide a full Instagram link (e.g. https://www.instagram.com/p/...)" }
  }
  const match = normalized.match(INSTAGRAM_URL_REGEX)
  if (!match) {
    return {
      error:
        "Please provide a valid Instagram post, reel, or video URL (e.g. https://www.instagram.com/p/ABC123/ or .../reel/ABC123/).",
    }
  }
  const shortcode = match[1]
  const url = `https://www.instagram.com/p/${shortcode}/`
  return { url }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. Send JSON with a "url" field.' } as RecipeImportResponse,
        { status: 400 }
      )
    }

    const urlPayload = typeof body === "object" && body !== null && "url" in body ? (body as { url: unknown }).url : undefined
    const parsed = normalizeAndValidateUrl(urlPayload)
    if ("error" in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error } as RecipeImportResponse,
        { status: 400 }
      )
    }
    const { url } = parsed

    const result = await runPythonRecipeImportPipeline(
      "instagram",
      { url },
      {
        timeoutMs: FETCH_TIMEOUT_MS,
        unavailableMessage: "Import service is not configured. Please try again later.",
        mapUnsuccessfulResponseToStatus: 422,
      }
    )

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("Instagram import error:", error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to import recipe from Instagram. Please try again.",
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
