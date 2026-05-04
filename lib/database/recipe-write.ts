import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database/supabase"
import type { RecipeIngredient } from "@/lib/types"
import { cleanRecipeIngredientUnit } from "@/backend/workers/shared/ingredient-cleaning"

export type UpsertRecipePayload = {
  recipeId?: string | null
  title: string
  authorId: string
  cuisine?: string | null
  mealType?: string | null
  protein?: string | null
  difficulty?: string | null
  servings?: number | null
  prepTime?: number | null
  cookTime?: number | null
  tags?: string[] | null
  nutrition?: Record<string, unknown> | null
  description?: string | null
  imageUrl?: string | null
  instructions?: string[] | null
  ingredients?: RecipeIngredient[] | null
}

function buildIngredientRows(recipeId: string, ingredients?: RecipeIngredient[] | null) {
  if (!ingredients || ingredients.length === 0) return []

  return ingredients
    .filter((ingredient) => ingredient?.name?.trim())
    .map((ingredient) => ({
      recipe_id: recipeId,
      display_name: ingredient.name.trim(),
      standardized_ingredient_id: ingredient.standardizedIngredientId ?? null,
      quantity: ingredient.quantity ?? null,
      units: cleanRecipeIngredientUnit(ingredient.unit),
      deleted_at: null,
    }))
}

function buildRecipeRow(payload: UpsertRecipePayload) {
  return {
    title: payload.title,
    prep_time: payload.prepTime ?? null,
    cook_time: payload.cookTime ?? null,
    servings: payload.servings ?? null,
    difficulty: payload.difficulty ?? null,
    nutrition: payload.nutrition ?? {},
    author_id: payload.authorId,
    description: payload.description ?? "",
    image_url: payload.imageUrl ?? null,
    instructions_list: Array.isArray(payload.instructions)
      ? payload.instructions.filter((step) => typeof step === "string" && step.trim().length > 0)
      : [],
    tags: payload.tags || [],
    protein: payload.protein || null,
    meal_type: payload.mealType || null,
    cuisine: payload.cuisine || "other",
  }
}

export async function upsertRecipeWithIngredients(
  client: SupabaseClient<Database>,
  payload: UpsertRecipePayload
): Promise<any | null> {
  const recipeRow = buildRecipeRow(payload)
  const hasExistingRecipe = Boolean(payload.recipeId)

  const recipeQuery = hasExistingRecipe
    ? client
        .from("recipes")
        .update({
          ...recipeRow,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", payload.recipeId as string)
        .select("*")
        .single()
    : client
        .from("recipes")
        .insert({
          ...recipeRow,
          updated_at: new Date().toISOString(),
        } as any)
        .select("*")
        .single()

  const { data: savedRecipe, error: recipeError } = await recipeQuery

  if (recipeError || !savedRecipe) {
    console.error("[recipe-write] recipe save error:", recipeError)
    return null
  }

  const recipeId = savedRecipe.id as string

  const { error: deleteError } = await client
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId)

  if (deleteError) {
    console.error("[recipe-write] ingredient cleanup error:", deleteError)
    return null
  }

  const ingredientRows = buildIngredientRows(recipeId, payload.ingredients)
  if (ingredientRows.length > 0) {
    const { error: insertError } = await client
      .from("recipe_ingredients")
      .insert(ingredientRows as any)

    if (insertError) {
      console.error("[recipe-write] ingredient insert error:", insertError)
      return null
    }
  }

  return savedRecipe
}
