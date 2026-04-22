import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { normalizeUsername } from "@/lib/auth/username"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params
    const username = normalizeUsername(decodeURIComponent(rawUsername))

    const supabase = createServiceSupabaseClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, pinned_recipe_ids")
      .eq("username", username)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const pinnedIds: string[] = profile.pinned_recipe_ids ?? []
    if (pinnedIds.length === 0) {
      return NextResponse.json({ recipes: [] })
    }

    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, title, image_url, description, prep_time, cook_time, servings, " +
        "difficulty, rating_avg, rating_count, tags, nutrition, author_id, " +
        "created_at, updated_at, protein, meal_type, cuisine"
      )
      .in("id", pinnedIds)
      .is("deleted_at", null)

    if (error) {
      console.error("[pinned-recipes GET] DB error:", error)
      return NextResponse.json({ error: "Failed to fetch pinned recipes" }, { status: 500 })
    }

    // Preserve pin order
    const recipeMap = new Map((data ?? []).map((r: any) => [r.id, r]))
    const recipes = pinnedIds
      .map((id) => recipeMap.get(id))
      .filter(Boolean)
      .map((r: any) => ({
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

    return NextResponse.json({ recipes, pinnedIds })
  } catch (error) {
    console.error("[pinned-recipes GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
