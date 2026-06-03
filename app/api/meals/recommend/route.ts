import { NextResponse } from "next/server"
import { EpicureUnavailableError, getEpicureNeighbors } from "@/lib/epicure/epicure-client"
import { buildAffinity, rankRecipes } from "@/lib/epicure/meal-recommendation"
import { fetchRecipeCandidates } from "@/lib/epicure/recipe-candidates"

export const runtime = "nodejs"

const NEIGHBORS_PER_SEED = 15
const CANDIDATE_POOL = 100
const DEFAULT_LIMIT = 20

/**
 * POST /api/meals/recommend
 * Body: { seedIngredients: string[], cuisine?: string, limit?: number }
 *
 * Recommends recipes whose ingredients are flavour/chemistry-aligned with the
 * seed ingredients (a chosen recipe, pantry, or explicit list), optionally
 * nudged toward a target cuisine.
 */
export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const seedIngredients: string[] = Array.isArray(body?.seedIngredients)
    ? body.seedIngredients.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : []

  if (seedIngredients.length === 0) {
    return NextResponse.json(
      { success: false, error: "seedIngredients must be a non-empty array of ingredient names" },
      { status: 400 }
    )
  }

  const cuisine = typeof body?.cuisine === "string" && body.cuisine.trim() ? body.cuisine.trim() : undefined
  const limit = Number.isFinite(body?.limit) && body.limit > 0 ? Math.floor(body.limit) : DEFAULT_LIMIT

  try {
    const neighborLists = await Promise.all(
      seedIngredients.map((seed) => getEpicureNeighbors(seed, { k: NEIGHBORS_PER_SEED }))
    )
    const affinity = buildAffinity(seedIngredients, neighborLists)

    const candidates = await fetchRecipeCandidates({ cuisine, limit: CANDIDATE_POOL })
    const data = rankRecipes(candidates, affinity, { cuisine, limit })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof EpicureUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 })
    }
    const message = error instanceof Error ? error.message : "Failed to recommend meals"
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}
