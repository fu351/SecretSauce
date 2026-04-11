import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { normalizeUsername } from "@/lib/auth/username"

export const runtime = "nodejs"

const PAGE_SIZE = 24

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params
    const username = normalizeUsername(decodeURIComponent(rawUsername))

    const { searchParams } = new URL(req.url)
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0))
    const limit  = Math.min(PAGE_SIZE, Math.max(1, Number(searchParams.get("limit") ?? PAGE_SIZE)))

    const supabase = createServiceSupabaseClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, title, image_url, description, prep_time, cook_time, servings, " +
        "difficulty, rating_avg, rating_count, tags, nutrition, author_id, " +
        "created_at, updated_at, protein, meal_type, cuisine"
      )
      .eq("author_id", profile.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[users/recipes GET] DB error:", error)
      return NextResponse.json({ error: "Failed to fetch recipes" }, { status: 500 })
    }

    // Shape into the Recipe interface expected by RecipeGrid
    const recipes = (data ?? []).map((r: any) => ({
      id:           r.id,
      title:        r.title,
      image_url:    r.image_url ?? null,
      description:  r.description ?? null,
      prep_time:    r.prep_time  ?? 0,
      cook_time:    r.cook_time  ?? 0,
      servings:     r.servings   ?? 0,
      difficulty:   r.difficulty ?? "beginner",
      rating_avg:   r.rating_avg  ?? 0,
      rating_count: r.rating_count ?? 0,
      tags:         r.tags  ?? [],
      nutrition:    r.nutrition ?? {},
      author_id:    r.author_id,
      created_at:   r.created_at,
      updated_at:   r.updated_at,
      protein:      r.protein   ?? undefined,
      meal_type:    r.meal_type ?? undefined,
      cuisine_name: r.cuisine   ?? undefined,
      ingredients:  [],
      content: {
        image_url:   r.image_url   ?? undefined,
        description: r.description ?? undefined,
      },
    }))

    return NextResponse.json({
      recipes,
      hasMore: recipes.length === limit,
    })
  } catch (error) {
    console.error("[users/recipes GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
