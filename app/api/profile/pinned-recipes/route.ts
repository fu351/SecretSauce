import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

const MAX_PINNED = 6

export async function PATCH(req: Request) {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { pinnedRecipeIds } = body as { pinnedRecipeIds: string[] }

    if (!Array.isArray(pinnedRecipeIds)) {
      return NextResponse.json({ error: "pinnedRecipeIds must be an array" }, { status: 400 })
    }
    if (pinnedRecipeIds.length > MAX_PINNED) {
      return NextResponse.json(
        { error: `Cannot pin more than ${MAX_PINNED} recipes` },
        { status: 400 }
      )
    }

    const supabase = createServiceSupabaseClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Verify all recipes belong to this user
    if (pinnedRecipeIds.length > 0) {
      const { data: recipes } = await supabase
        .from("recipes")
        .select("id")
        .in("id", pinnedRecipeIds)
        .eq("author_id", profile.id)
        .is("deleted_at", null)

      if ((recipes?.length ?? 0) !== pinnedRecipeIds.length) {
        return NextResponse.json(
          { error: "One or more recipes not found or not owned by you" },
          { status: 400 }
        )
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ pinned_recipe_ids: pinnedRecipeIds })
      .eq("id", profile.id)

    if (error) {
      console.error("[profile/pinned-recipes PATCH] DB error:", error)
      return NextResponse.json({ error: "Failed to update pinned recipes" }, { status: 500 })
    }

    return NextResponse.json({ pinnedRecipeIds })
  } catch (error) {
    console.error("[profile/pinned-recipes PATCH] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
