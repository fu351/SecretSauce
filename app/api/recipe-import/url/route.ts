import { NextRequest, NextResponse } from "next/server"
import type { RecipeImportResponse } from "@/lib/types"
import { runPythonRecipeImportPipeline } from "@/backend/orchestrators/python-api-pipeline/pipeline"
import { guardApiAvailability } from "@/lib/dev/api-availability"

export const runtime = "nodejs"

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "")
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("127.") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    /^169\.254\./.test(normalized) ||
    /^fc[0-9a-f]{2}:/i.test(normalized) ||
    /^fd[0-9a-f]{2}:/i.test(normalized) ||
    /^fe80:/i.test(normalized)
  )
}

function normalizeRecipeUrl(input: unknown): { url: string } | { error: string } {
  if (typeof input !== "string" || !input.trim()) {
    return { error: "URL is required" }
  }

  if (input.length > 2048) {
    return { error: "URL is too long" }
  }

  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    return { error: "Invalid URL format" }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "URL must use http or https" }
  }

  if (parsed.username || parsed.password || isBlockedHostname(parsed.hostname)) {
    return { error: "URL host is not allowed" }
  }

  return { url: parsed.toString() }
}

export async function POST(request: NextRequest) {
  try {
    const unavailable = guardApiAvailability("recipe-import-url")
    if (unavailable) return unavailable

    const { url } = await request.json()

    const parsedUrl = normalizeRecipeUrl(url)
    if ("error" in parsedUrl) {
      return NextResponse.json(
        { success: false, error: parsedUrl.error } as RecipeImportResponse,
        { status: 400 }
      )
    }

    const result = await runPythonRecipeImportPipeline("url", { url: parsedUrl.url })
    return NextResponse.json(result.body, { status: result.status })

  } catch (error) {
    console.error("Recipe URL import error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to import recipe from URL"
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
