import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

// POST — like a recipe
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    // Upsert (safe to call even if already liked)
    const { error } = await supabase
      .from("recipe_likes")
      .upsert({ recipe_id: recipeId, profile_id: profile.id }, { onConflict: "recipe_id,profile_id", ignoreDuplicates: true })

    if (error) {
      console.error("[recipes/[id]/likes POST]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return updated count
    const { count } = await supabase
      .from("recipe_likes")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipeId)

    return NextResponse.json({ success: true, likeCount: count ?? 0 })
  } catch (error) {
    console.error("[recipes/[id]/likes POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE — unlike a recipe
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    const { error } = await supabase
      .from("recipe_likes")
      .delete()
      .eq("recipe_id", recipeId)
      .eq("profile_id", profile.id)

    if (error) {
      console.error("[recipes/[id]/likes DELETE]", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return updated count
    const { count } = await supabase
      .from("recipe_likes")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipeId)

    return NextResponse.json({ success: true, likeCount: count ?? 0 })
  } catch (error) {
    console.error("[recipes/[id]/likes DELETE]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
