import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { parseInstructionsFromDB } from "@/lib/types"
import { isAdmin, resolveAuthenticatedProfileId } from "@/lib/auth/admin"

export const runtime = "nodejs"

async function loadRecipeResponse(supabase: ReturnType<typeof createServiceSupabaseClient>, recipeId: string) {
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
    return { error: error?.message || "Recipe not found", recipe: null as any }
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

  return { recipe, error: null as string | null }
}

function normalizeIngredientsForRpc(ingredients: any[] | null | undefined) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return []
  return ingredients
    .filter((ingredient) => ingredient?.name?.trim())
    .map((ingredient) => ({
      display_name: String(ingredient.name).trim(),
      standardized_ingredient_id: ingredient.standardizedIngredientId ?? null,
      quantity: ingredient.quantity ?? null,
      units: ingredient.unit ?? null,
    }))
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const supabase = createServiceSupabaseClient()
    const authState = await auth()
    const clerkUserId = authState.userId ?? null

    const { recipe, error } = await loadRecipeResponse(supabase, recipeId)
    if (error || !recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    const authorId = (recipe as any).author_id ?? null
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const supabase = createServiceSupabaseClient()
    const profileId = await resolveAuthenticatedProfileId()

    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: existingRecipe, error: existingError } = await supabase
      .from("recipes")
      .select("id, author_id, deleted_at")
      .eq("id", recipeId)
      .single()

    if (existingError || !existingRecipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    const admin = await isAdmin(profileId)
    if (!admin && existingRecipe.author_id !== profileId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
    }

    const instructionSteps = Array.isArray(body?.instructions)
      ? body.instructions
          .map((step: any) => (typeof step === "string" ? step.trim() : step?.description?.trim()))
          .filter(Boolean)
      : []

    const ingredients = normalizeIngredientsForRpc(Array.isArray(body?.ingredients) ? body.ingredients : [])

    const { data, error } = await supabase.rpc("fn_upsert_recipe_with_ingredients", {
      p_recipe_id: recipeId,
      p_title: title,
      p_author_id: existingRecipe.author_id || profileId,
      p_cuisine: typeof body?.cuisine === "string" ? body.cuisine || null : null,
      p_meal_type: body?.mealType ?? null,
      p_protein: body?.protein ?? null,
      p_difficulty: body?.difficulty ?? null,
      p_servings: body?.servings ? Number(body.servings) : null,
      p_prep_time: body?.prepTime ? Number(body.prepTime) : null,
      p_cook_time: body?.cookTime ? Number(body.cookTime) : null,
      p_tags: Array.isArray(body?.tags) ? body.tags : [],
      p_nutrition: body?.nutrition ?? {},
      p_description: typeof body?.description === "string" ? body.description : null,
      p_image_url: typeof body?.imageUrl === "string" ? body.imageUrl || null : null,
      p_instructions: instructionSteps,
      p_ingredients: ingredients,
    })

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to update recipe" }, { status: 500 })
    }

    const response = await loadRecipeResponse(supabase, recipeId)
    if (!response.recipe) {
      return NextResponse.json({ recipe: { id: recipeId } })
    }

    return NextResponse.json({ recipe: response.recipe })
  } catch (error) {
    console.error("[recipes/[id] PATCH]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params
    const supabase = createServiceSupabaseClient()
    const profileId = await resolveAuthenticatedProfileId()

    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: existingRecipe, error: existingError } = await supabase
      .from("recipes")
      .select("id, author_id")
      .eq("id", recipeId)
      .single()

    if (existingError || !existingRecipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 })
    }

    const admin = await isAdmin(profileId)
    if (!admin && existingRecipe.author_id !== profileId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { error } = await supabase
      .from("recipes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", recipeId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[recipes/[id] DELETE]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
