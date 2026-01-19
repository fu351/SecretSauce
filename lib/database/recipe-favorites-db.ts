"use client"

import { useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"
import type { Recipe } from "@/lib/types"

export type RecipeFavoriteRow = Database["public"]["Tables"]["recipe_favorites"]["Row"]
export type RecipeFavoriteInsert = Database["public"]["Tables"]["recipe_favorites"]["Insert"]
export type RecipeFavoriteUpdate = Database["public"]["Tables"]["recipe_favorites"]["Update"]

/**
 * Universal database operations for recipe favorites
 * Separated from state management for reusability across different components
 */

export function useRecipeFavoritesDB() {
  /**
   * Fetch user's favorite recipes with full recipe data using relationship join
   */
  const fetchFavoriteRecipes = useCallback(async (userId: string): Promise<Recipe[]> => {
    console.log("[Recipe Favorites DB] Fetching favorite recipes for user:", userId)

    // Single batch query using relationship join - more efficient than two separate queries
    const { data, error } = await supabase
      .from("recipe_favorites")
      .select(`
        recipe_id,
        recipes (
          id,
          title,
          content,
          prep_time,
          cook_time,
          servings,
          difficulty,
          rating_avg,
          rating_count,
          author_id,
          tags,
          protein,
          meal_type,
          cuisine,
          nutrition,
          ingredients,
          created_at,
          updated_at
        )
      `)
      .eq("user_id", userId)

    if (error) {
      // Table might not exist in test environment or foreign key relationship not configured
      if (error.code === "PGRST116" || error.code === "PGRST200" || error.message?.includes("relation")) {
        console.log("[Recipe Favorites DB] Favorites table not available or relationship not configured:", error.message)
        return []
      }
      console.error("[Recipe Favorites DB] Error fetching favorites:", error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Extract and map recipes from the joined result
    const recipes = data
      .map((item: any) => item.recipes)
      .filter(Boolean)
      .map((recipe: any) => ({
        id: recipe.id,
        title: recipe.title,
        description: recipe.content?.description || "",
        image_url: recipe.content?.image_url,
        prep_time: recipe.prep_time || 0,
        cook_time: recipe.cook_time || 0,
        servings: recipe.servings,
        difficulty: recipe.difficulty,
        cuisine_name: recipe.cuisine || undefined,
        ingredients: recipe.ingredients || [],
        instructions: recipe.content?.instructions || [],
        nutrition: recipe.nutrition || {},
        author_id: recipe.author_id || "",
        rating_avg: recipe.rating_avg || 0,
        rating_count: recipe.rating_count || 0,
        tags: {
          dietary: recipe.tags || [],
          protein: recipe.protein || undefined,
          meal_type: recipe.meal_type || undefined,
          cuisine_guess: undefined,
        },
        created_at: recipe.created_at,
        updated_at: recipe.updated_at,
      }))

    return recipes
  }, [])

  /**
   * Fetch just the favorite recipe IDs for a user (lightweight query)
   */
  const fetchFavoriteRecipeIds = useCallback(async (userId: string): Promise<string[]> => {
    console.log("[Recipe Favorites DB] Fetching favorite recipe IDs for user:", userId)

    const { data, error } = await supabase
      .from("recipe_favorites")
      .select("recipe_id")
      .eq("user_id", userId)

    if (error) {
      console.error("[Recipe Favorites DB] Error fetching favorite IDs:", error)
      return []
    }

    return (data || []).map((item) => item.recipe_id)
  }, [])

  /**
   * Check if a recipe is favorited by a user
   */
  const isFavorite = useCallback(async (userId: string, recipeId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("recipe_favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)
      .single()

    if (error) {
      // Not found is expected for non-favorites
      if (error.code === "PGRST116") {
        return false
      }
      console.error("[Recipe Favorites DB] Error checking favorite:", error)
      return false
    }

    return !!data
  }, [])

  /**
   * Add a recipe to favorites
   */
  const addFavorite = useCallback(async (userId: string, recipeId: string): Promise<RecipeFavoriteRow | null> => {
    console.log("[Recipe Favorites DB] Adding favorite:", { userId, recipeId })

    const { data, error } = await supabase
      .from("recipe_favorites")
      .insert({
        user_id: userId,
        recipe_id: recipeId,
      })
      .select()
      .single()

    if (error) {
      // Duplicate entry is acceptable - just means it's already favorited
      if (error.code === "23505") {
        console.log("[Recipe Favorites DB] Recipe already favorited")
        return null
      }
      console.error("[Recipe Favorites DB] Error adding favorite:", error)
      return null
    }

    console.log("[Recipe Favorites DB] Favorite added successfully")
    return data
  }, [])

  /**
   * Remove a recipe from favorites
   */
  const removeFavorite = useCallback(async (userId: string, recipeId: string): Promise<boolean> => {
    console.log("[Recipe Favorites DB] Removing favorite:", { userId, recipeId })

    const { error } = await supabase
      .from("recipe_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)

    if (error) {
      console.error("[Recipe Favorites DB] Error removing favorite:", error)
      return false
    }

    console.log("[Recipe Favorites DB] Favorite removed successfully")
    return true
  }, [])

  /**
   * Toggle favorite status for a recipe
   */
  const toggleFavorite = useCallback(
    async (userId: string, recipeId: string): Promise<boolean> => {
      const isCurrentlyFavorite = await isFavorite(userId, recipeId)

      if (isCurrentlyFavorite) {
        await removeFavorite(userId, recipeId)
        return false
      } else {
        await addFavorite(userId, recipeId)
        return true
      }
    },
    [isFavorite, removeFavorite, addFavorite]
  )

  /**
   * Remove all favorites for a user
   */
  const clearAllFavorites = useCallback(async (userId: string): Promise<boolean> => {
    console.log("[Recipe Favorites DB] Clearing all favorites for user:", userId)

    const { error } = await supabase
      .from("recipe_favorites")
      .delete()
      .eq("user_id", userId)

    if (error) {
      console.error("[Recipe Favorites DB] Error clearing favorites:", error)
      return false
    }

    console.log("[Recipe Favorites DB] All favorites cleared successfully")
    return true
  }, [])

  return useMemo(
    () => ({
      fetchFavoriteRecipes,
      fetchFavoriteRecipeIds,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      clearAllFavorites,
    }),
    [fetchFavoriteRecipes, fetchFavoriteRecipeIds, isFavorite, addFavorite, removeFavorite, toggleFavorite, clearAllFavorites]
  )
}
