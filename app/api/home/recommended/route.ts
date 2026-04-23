import { NextResponse } from "next/server"
import { recipeDB } from "@/lib/database/recipe-db"

export const runtime = "nodejs"

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 48

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0)
    const requestedLimit = Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit))

    const page = await recipeDB.fetchRecipes({
      sortBy: "created_at",
      offset,
      limit: limit + 1,
    })

    return NextResponse.json({
      items: page.slice(0, limit),
      hasMore: page.length > limit,
    })
  } catch (error) {
    console.error("[home/recommended GET]", error)
    return NextResponse.json({ error: "Failed to load recommendations" }, { status: 500 })
  }
}
