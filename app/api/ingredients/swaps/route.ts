import { NextResponse } from "next/server"
import { EpicureUnavailableError, getEpicureSwaps, isAbortError } from "@/lib/epicure/epicure-client"
import { rankSwaps } from "@/lib/epicure/swap-ranking"

export const runtime = "nodejs"

// Fetch more candidates than we display so ranking/filtering has room to work.
const BACKEND_FETCH_K = 24
const MAX_LIMIT = 50
// Mirrors the Python service's Query(max_length=...) cap; defense-in-depth.
const MAX_INGREDIENT_LEN = 200

/**
 * GET /api/ingredients/swaps?ingredient=chicken&limit=5&exclude=pork,beef&minScore=0.3
 *
 * Returns flavour/chemistry-aware substitute ingredients, blended across the
 * Epicure chemistry (chem) and core models and ranked for presentation.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ingredient = searchParams.get("ingredient")?.trim()

  if (!ingredient) {
    return NextResponse.json({ success: false, error: "ingredient query parameter is required" }, { status: 400 })
  }

  if (ingredient.length > MAX_INGREDIENT_LEN) {
    return NextResponse.json(
      { success: false, error: `ingredient may not exceed ${MAX_INGREDIENT_LEN} characters` },
      { status: 400 }
    )
  }

  const requestedLimit = parsePositiveInt(searchParams.get("limit"))
  const limit = requestedLimit === undefined ? undefined : Math.min(requestedLimit, MAX_LIMIT)
  // Overscan must always cover the requested limit so ranking has headroom.
  const fetchK = Math.max(BACKEND_FETCH_K, limit ?? 0)
  const rawMinScore = parseFloatOrUndefined(searchParams.get("minScore"))
  // Negative thresholds are meaningless (cosine-style scores); clamp to >= 0.
  const minScore = rawMinScore === undefined ? undefined : Math.max(rawMinScore, 0)
  const excludeTokens = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    const raw = await getEpicureSwaps(ingredient, { k: fetchK })
    const data = rankSwaps(raw, ingredient, { excludeTokens, limit, minScore })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof EpicureUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    if (isAbortError(error)) {
      return NextResponse.json({ success: false, error: "Ingredient swap service timed out" }, { status: 504 })
    }
    // Log the upstream detail server-side; return a generic message to avoid leaking internals.
    console.error("[/api/ingredients/swaps] upstream error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch ingredient swaps" }, { status: 502 })
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
