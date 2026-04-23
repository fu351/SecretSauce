import { NextResponse } from "next/server"
import type { ProfilePagedResult } from "@/lib/social/profile-content"
import type { Recipe } from "@/lib/types"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { resolveProfileAccess } from "@/lib/social/profile-access"

export const runtime = "nodejs"

const PAGE_SIZE = 24

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params

    const { searchParams } = new URL(req.url)
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0))
    const limit  = Math.min(PAGE_SIZE, Math.max(1, Number(searchParams.get("limit") ?? PAGE_SIZE)))

    const access = await resolveProfileAccess(rawUsername)

    if (!access) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!access.canViewContent) {
      return NextResponse.json({ error: "Profile is private" }, { status: 403 })
    }

    const supabase = createServiceSupabaseClient()

    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, title, image_url, description, prep_time, cook_time, servings, " +
        "difficulty, rating_avg, rating_count, tags, nutrition, author_id, " +
        "created_at, updated_at, protein, meal_type, cuisine"
      )
      .eq("author_id", access.profile.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[users/recipes GET] DB error:", error)
      return NextResponse.json({ error: "Failed to fetch recipes" }, { status: 500 })
    }

    // Shape into the Recipe interface expected by RecipeGrid
    const recipes: Recipe[] = (data ?? []).map((r: any) => ({
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

    const payload: ProfilePagedResult<Recipe> & { recipes: Recipe[] } = {
      items: recipes,
      recipes,
      hasMore: recipes.length === limit,
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("[users/recipes GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
