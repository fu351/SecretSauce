import { NextResponse } from "next/server"
import { EpicureUnavailableError, getEpicureNeighbors, isAbortError } from "@/lib/epicure/epicure-client"
import { buildAffinity, rankRecipes } from "@/lib/epicure/meal-recommendation"
import { fetchRecipeCandidates } from "@/lib/epicure/recipe-candidates"
import type { SwapSuggestion } from "@/lib/epicure/types"

export const runtime = "nodejs"

const NEIGHBORS_PER_SEED = 15
const CANDIDATE_POOL = 100
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
// Cap how many seeds one request may fan out to the Python service.
const MAX_SEEDS = 20
// Mirrors the Python service's Query(max_length=...) cap; defense-in-depth.
const MAX_INGREDIENT_LEN = 200

/**
 * POST /api/meals/recommend
 * Body: { seedIngredients: string[], cuisine?: string, limit?: number }
 *
 * Recommends recipes whose ingredients are flavour/chemistry-aligned with the
 * seed ingredients (a chosen recipe, pantry, or explicit list), optionally
 * nudged toward a target cuisine.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>
  const seedIngredients: string[] = Array.isArray(payload.seedIngredients)
    ? payload.seedIngredients
        .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
    : []

  if (seedIngredients.length === 0) {
    return NextResponse.json(
      { success: false, error: "seedIngredients must be a non-empty array of ingredient names" },
      { status: 400 }
    )
  }

  if (seedIngredients.length > MAX_SEEDS) {
    return NextResponse.json(
      { success: false, error: `seedIngredients may not exceed ${MAX_SEEDS} items` },
      { status: 400 }
    )
  }

  if (seedIngredients.some((s) => s.length > MAX_INGREDIENT_LEN)) {
    return NextResponse.json(
      { success: false, error: `each seed ingredient may not exceed ${MAX_INGREDIENT_LEN} characters` },
      { status: 400 }
    )
  }

  const cuisine =
    typeof payload.cuisine === "string" && payload.cuisine.trim() ? payload.cuisine.trim() : undefined
  const limit =
    typeof payload.limit === "number" && Number.isFinite(payload.limit) && payload.limit > 0
      ? Math.min(Math.floor(payload.limit), MAX_LIMIT)
      : DEFAULT_LIMIT

  try {
    // Tolerate partial seed failures: one unresolvable seed must not kill the
    // whole request. Only propagate an error when every seed lookup fails.
    const settled = await Promise.allSettled(
      seedIngredients.map((seed) => getEpicureNeighbors(seed, { k: NEIGHBORS_PER_SEED }))
    )
    const neighborLists = settled
      .filter((r): r is PromiseFulfilledResult<SwapSuggestion[]> => r.status === "fulfilled")
      .map((r) => r.value)

    if (neighborLists.length === 0) {
      // Re-throw the first rejection so the catch below maps it to 503/504/502.
      const firstRejection = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined
      throw firstRejection?.reason ?? new Error("All seed lookups failed")
    }

    const affinity = buildAffinity(seedIngredients, neighborLists)

    const candidates = await fetchRecipeCandidates({ cuisine, limit: CANDIDATE_POOL })
    const data = rankRecipes(candidates, affinity, { cuisine, limit })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof EpicureUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    if (isAbortError(error)) {
      return NextResponse.json({ success: false, error: "Meal recommendation service timed out" }, { status: 504 })
    }
    console.error("[/api/meals/recommend] upstream error:", error)
    return NextResponse.json({ success: false, error: "Failed to recommend meals" }, { status: 502 })
  }
}
