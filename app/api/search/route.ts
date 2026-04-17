import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { recipeDB } from "@/lib/database/recipe-db"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") ?? "").trim()
    const type = searchParams.get("type") ?? "auto"

    if (!q) {
      return NextResponse.json({ recipes: [], users: [] })
    }

    const isUserSearch = type === "user" || (type === "auto" && q.startsWith("@"))
    const userQuery = isUserSearch ? q.replace(/^@/, "") : q

    if (isUserSearch) {
      const supabase = createServiceSupabaseClient()
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .or(`username.ilike.%${userQuery}%,full_name.ilike.%${userQuery}%`)
        .limit(10)

      if (error) {
        console.error("[search] user search error:", error)
        return NextResponse.json({ recipes: [], users: [] })
      }

      return NextResponse.json({ recipes: [], users: data ?? [] })
    }

    const recipes = await recipeDB.searchRecipes(q, { limit: 8 })
    return NextResponse.json({
      recipes: recipes.map((r) => ({
        id: r.id,
        title: r.title,
        difficulty: r.difficulty,
        rating_avg: r.rating_avg,
        tags: r.tags,
      })),
      users: [],
    })
  } catch (error) {
    console.error("[search] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
