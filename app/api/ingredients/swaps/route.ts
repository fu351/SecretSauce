import { NextResponse } from "next/server"
import { EpicureUnavailableError, getEpicureSwaps } from "@/lib/epicure/epicure-client"
import { rankSwaps } from "@/lib/epicure/swap-ranking"

export const runtime = "nodejs"

// Fetch more candidates than we display so ranking/filtering has room to work.
const BACKEND_FETCH_K = 24

/**
 * GET /api/ingredients/swaps?ingredient=chicken&limit=5&exclude=pork,beef&minScore=0.3
 *
 * Returns flavour/chemistry-aware substitute ingredients, blended across the
 * Epicure chemistry and recipe-context models and ranked for presentation.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ingredient = searchParams.get("ingredient")?.trim()

  if (!ingredient) {
    return NextResponse.json({ success: false, error: "ingredient query parameter is required" }, { status: 400 })
  }

  const limit = parsePositiveInt(searchParams.get("limit"))
  const minScore = parseFloatOrUndefined(searchParams.get("minScore"))
  const excludeTokens = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    const raw = await getEpicureSwaps(ingredient, { k: BACKEND_FETCH_K })
    const data = rankSwaps(raw, ingredient, { excludeTokens, limit, minScore })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof EpicureUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    const message = error instanceof Error ? error.message : "Failed to fetch ingredient swaps"
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseFloatOrUndefined(value: string | null): number | undefined {
  if (value === null) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
