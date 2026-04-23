import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { parseInstructionsFromDB } from "@/lib/types"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const supabase = createServiceSupabaseClient()
    const authState = await auth()
    const clerkUserId = authState.userId ?? null

    const { data, error } = await supabase
      .from("recipes")
      .select(`
        *,
        recipe_ingredients (
          id,
          display_name,
          quantity,
          units,
          standardized_ingredient_id,
          standardized_ingredients ( canonical_name )
        )
      `)
      .eq("id", recipeId)
      .is("deleted_at", null)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    const content = data.content || {}
    const description = (data as any).description ?? content.description ?? ""
    const imageUrl = (data as any).image_url ?? content.image_url
    const instructionsRaw = (data as any).instructions_list ?? content.instructions

    const recipe = {
      id: data.id,
      title: data.title,
      prep_time: (data as any).prep_time || 0,
      cook_time: (data as any).cook_time || 0,
      servings: (data as any).servings,
      difficulty: (data as any).difficulty,
      cuisine_name: (data as any).cuisine || undefined,
      ingredients: ((data as any).recipe_ingredients || []).map((ing: any) => ({
        id: ing.id,
        display_name: ing.display_name,
        name: ing.display_name,
        quantity: ing.quantity ?? undefined,
        units: ing.units ?? undefined,
        unit: ing.units ?? undefined,
        standardizedIngredientId: ing.standardized_ingredient_id ?? undefined,
        standardized_ingredient_id: ing.standardized_ingredient_id ?? undefined,
        standardizedName:
          ing.standardized_ingredients?.canonical_name ?? undefined,
      })),
      nutrition: (data as any).nutrition || {},
      author_id: (data as any).author_id || "",
      rating_avg: (data as any).rating_avg || 0,
      rating_count: (data as any).rating_count || 0,
      description,
      image_url: imageUrl,
      content: {
        description,
        image_url: imageUrl,
        instructions: parseInstructionsFromDB(instructionsRaw),
      },
      tags: (data as any).tags || [],
      protein: (data as any).protein || undefined,
      meal_type: (data as any).meal_type || undefined,
      created_at: data.created_at,
      updated_at: (data as any).updated_at,
    }

    const authorId = (data as any).author_id ?? null
    let author: {
      id: string
      username: string | null
      full_name: string | null
      avatar_url: string | null
      is_private: boolean
      followStatus: "none" | "pending" | "accepted"
    } | null = null

    if (authorId) {
      const { data: authorProfile } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, is_private")
        .eq("id", authorId)
        .maybeSingle()

      let viewerProfileId: string | null = null
      if (clerkUserId) {
        const { data: viewerProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("clerk_user_id", clerkUserId)
          .maybeSingle()
        viewerProfileId = viewerProfile?.id ?? null
      }

      let followStatus: "none" | "pending" | "accepted" = "none"
      if (viewerProfileId && viewerProfileId !== authorId) {
        const relationship = await followDB.withServiceClient(supabase).getFollowStatus(viewerProfileId, authorId)
        followStatus = relationship.status
      }

      if (authorProfile) {
        author = {
          id: authorProfile.id,
          username: authorProfile.username,
          full_name: authorProfile.full_name,
          avatar_url: authorProfile.avatar_url,
          is_private: authorProfile.is_private,
          followStatus,
        }
      }
    }

    return NextResponse.json({ recipe, author })
  } catch (error) {
    console.error("[recipes/[id] GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
