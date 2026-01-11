"use client"

import { useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import {Recipe} from "@/lib/types/recipe"

/**
 * Universal database operations for recipes
 * Separated from state management for reusability across different components
 */

export function useRecipeDB() {
  /**
   * Map raw database recipe to typed Recipe
   */
  const mapRecipe = useCallback((dbItem: any): Recipe => {
    // Parse tags JSONB or provide defaults
    const tags = dbItem.tags || {
      dietary: [],
      allergens: undefined,
      protein: undefined,
      meal_type: undefined,
      cuisine_guess: undefined
    }

    return {
      id: dbItem.id,
      title: dbItem.title,
      description: dbItem.description,
      image_url: dbItem.image_url,
      prep_time: dbItem.prep_time || 0,
      cook_time: dbItem.cook_time || 0,
      servings: dbItem.servings,
      difficulty: dbItem.difficulty,
      cuisine_id: dbItem.cuisine_id,
      cuisine_name: undefined, // Resolved by page layer using cuisine ID mapping
      ingredients: dbItem.ingredients || [],
      instructions: dbItem.instructions || [],
      nutrition: dbItem.nutrition || {},
      author_id: dbItem.author_id,
      rating_avg: dbItem.rating_avg || 0,
      rating_count: dbItem.rating_count || 0,

      // UNIFIED TAG SYSTEM - Single JSONB field
      tags: tags,

      created_at: dbItem.created_at,
      updated_at: dbItem.updated_at
    }
  }, [])

  /**
   * Fetch all recipes with optional filtering and sorting
   */
  const fetchRecipes = useCallback(async (options?: {
    sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
    difficulty?: string
    cuisineId?: number
    authorId?: string
    tags?: string[]
    limit?: number
    offset?: number
  }): Promise<Recipe[]> => {
    const {
      sortBy = "created_at",
      difficulty,
      cuisineId,
      authorId,
      tags,
      limit = 50,
      offset = 0
    } = options || {}

    let query = supabase
      .from("recipes")
      .select("*")

    // Apply filters
    if (difficulty) {
      query = query.eq("difficulty", difficulty)
    }

    if (cuisineId) {
      query = query.eq("cuisine_id", cuisineId)
    }

    if (authorId) {
      query = query.eq("author_id", authorId)
    }

    // Apply tag filter (uses GIN index on JSONB tags)
    if (tags && tags.length > 0) {
      // Filter by dietary tags using JSONB containment
      query = query.contains("tags", { dietary: tags })
    }

    // Apply sorting (uses B-tree indexes)
    const ascending = sortBy === "title" || sortBy === "prep_time"
    const descending = sortBy === "created_at" || sortBy === "rating_avg"

    if (sortBy === "created_at") {
      query = query.order("created_at", { ascending: false })
    } else if (sortBy === "rating_avg") {
      query = query.order("rating_avg", { ascending: false, nullsFirst: false })
    } else if (sortBy === "prep_time") {
      query = query.order("prep_time", { ascending: true })
    } else if (sortBy === "title") {
      query = query.order("title", { ascending: true })
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) {
      console.warn("[Recipe DB] Error fetching recipes:", error.message)
      return []
    }

    return (data || []).map(mapRecipe)
  }, [mapRecipe])

  /**
   * Fetch a single recipe by ID
   */
  const fetchRecipeById = useCallback(async (id: string): Promise<Recipe | null> => {
    const { data, error } = await supabase
      .from("recipes")
      .select("*, cuisines(id, name)")
      .eq("id", id)
      .single()

    if (error) {
      console.warn("[Recipe DB] Error fetching recipe:", error.message)
      return null
    }

    return data ? mapRecipe(data) : null
  }, [mapRecipe])

  /**
   * Fetch recipes by author
   */
  const fetchRecipesByAuthor = useCallback(async (
    authorId: string,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> => {
    return fetchRecipes({
      ...options,
      authorId
    })
  }, [fetchRecipes])

  /**
   * Fetch recipes by cuisine
   */
  const fetchRecipesByCuisine = useCallback(async (
    cuisineId: number,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> => {
    return fetchRecipes({
      ...options,
      cuisineId
    })
  }, [fetchRecipes])

  /**
   * Fetch recipes by difficulty level
   */
  const fetchRecipesByDifficulty = useCallback(async (
    difficulty: string,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> => {
    return fetchRecipes({
      ...options,
      difficulty
    })
  }, [fetchRecipes])

  /**
   * Fetch recipes by tags
   */
  const fetchRecipesByTags = useCallback(async (
    tags: string[],
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> => {
    return fetchRecipes({
      ...options,
      tags
    })
  }, [fetchRecipes])

  /**
   * Insert a new recipe
   */
  const insertRecipe = useCallback(async (recipe: Partial<Recipe>): Promise<Recipe | null> => {
    console.log("[Recipe DB] Attempting to insert recipe:", recipe)

    const { data, error } = await supabase
      .from("recipes")
      .insert(recipe)
      .select("*")
      .single()

    if (error) {
      console.error("[Recipe DB] Insert error:", error)
      return null
    }

    console.log("[Recipe DB] Insert successful, returned data:", data)
    return data ? mapRecipe(data) : null
  }, [mapRecipe])

  /**
   * Update an existing recipe
   */
  const updateRecipe = useCallback(async (
    id: string,
    updates: Partial<Recipe>
  ): Promise<Recipe | null> => {
    console.log("[Recipe DB] Attempting to update recipe:", id, updates)

    const { data, error } = await supabase
      .from("recipes")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      console.error("[Recipe DB] Update error:", error)
      return null
    }

    console.log("[Recipe DB] Update successful, returned data:", data)
    return data ? mapRecipe(data) : null
  }, [mapRecipe])

  /**
   * Delete a recipe
   */
  const deleteRecipe = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from("recipes")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[Recipe DB] Delete error:", error)
      return false
    }

    console.log("[Recipe DB] Delete successful for recipe:", id)
    return true
  }, [])

  /**
   * Update recipe rating
   */
  const updateRecipeRating = useCallback(async (
    id: string,
    rating_avg: number,
    rating_count: number
  ): Promise<Recipe | null> => {
    return updateRecipe(id, {
      rating_avg,
      rating_count
    })
  }, [updateRecipe])

  /**
   * Batch update recipe ratings
   */
  const batchUpdateRatings = useCallback(async (
    updates: Array<{ id: string; rating_avg: number; rating_count: number }>
  ): Promise<Recipe[]> => {
    const results = await Promise.all(
      updates.map(({ id, rating_avg, rating_count }) =>
        updateRecipeRating(id, rating_avg, rating_count)
      )
    )
    return results.filter((recipe): recipe is Recipe => recipe !== null)
  }, [updateRecipeRating])

  /**
   * Search recipes by title, description, or ingredients
   */
  const searchRecipes = useCallback(async (
    query: string,
    options?: {
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> => {
    const { limit = 50, offset = 0 } = options || {}
    const searchQuery = query.toLowerCase()

    // Fetch recipes and filter client-side for flexible search
    // (Supabase doesn't support full-text search without custom functions)
    const { data, error } = await supabase
      .from("recipes")
      .select("*, cuisines(id, name)")
      .range(offset, offset + limit - 1)

    if (error) {
      console.warn("[Recipe DB] Error searching recipes:", error.message)
      return []
    }

    return (data || [])
      .filter((recipe: any) => {
        const title = recipe.title?.toLowerCase() || ""
        const description = recipe.description?.toLowerCase() || ""
        const matchesTitle = title.includes(searchQuery)
        const matchesDescription = description.includes(searchQuery)

        // Search ingredients by name
        const matchesIngredient = Array.isArray(recipe.ingredients) &&
          recipe.ingredients.some((ing: any) =>
            ing.name?.toLowerCase().includes(searchQuery)
          )

        return matchesTitle || matchesDescription || matchesIngredient
      })
      .map(mapRecipe)
  }, [mapRecipe])

  return useMemo(() => ({
    mapRecipe,
    fetchRecipes,
    fetchRecipeById,
    fetchRecipesByAuthor,
    fetchRecipesByCuisine,
    fetchRecipesByDifficulty,
    fetchRecipesByTags,
    insertRecipe,
    updateRecipe,
    deleteRecipe,
    updateRecipeRating,
    batchUpdateRatings,
    searchRecipes
  }), [
    mapRecipe,
    fetchRecipes,
    fetchRecipeById,
    fetchRecipesByAuthor,
    fetchRecipesByCuisine,
    fetchRecipesByDifficulty,
    fetchRecipesByTags,
    insertRecipe,
    updateRecipe,
    deleteRecipe,
    updateRecipeRating,
    batchUpdateRatings,
    searchRecipes
  ])
}