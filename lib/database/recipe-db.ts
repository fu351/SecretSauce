"use client"

import { useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { Recipe, parseInstructionsFromDB } from "@/lib/types"

/**
 * Universal database operations for recipes
 * Separated from state management for reusability across different components
 */

export function useRecipeDB() {
  /**
   * Map raw database recipe to typed Recipe
   */
  const mapRecipe = useCallback((dbItem: any): Recipe => {
    // Extract content JSONB
    const content = dbItem.content || {}

    return {
      id: dbItem.id,
      title: dbItem.title,
      prep_time: dbItem.prep_time || 0,
      cook_time: dbItem.cook_time || 0,
      servings: dbItem.servings,
      difficulty: dbItem.difficulty,
      cuisine_name: dbItem.cuisine || undefined, // Map enum directly to string
      ingredients: dbItem.ingredients || [],
      nutrition: dbItem.nutrition || {},
      author_id: dbItem.author_id || '',
      rating_avg: dbItem.rating_avg || 0,
      rating_count: dbItem.rating_count || 0,

      content: {
        description: content.description || '',
        image_url: content.image_url,
        instructions: parseInstructionsFromDB(content.instructions),
      },

      // UNIFIED TAG SYSTEM - tags array contains both dietary and allergen tags
      tags: {
        dietary: dbItem.tags || [],
        protein: dbItem.protein || undefined,
        meal_type: dbItem.meal_type || undefined,
        cuisine_guess: undefined
      },

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
    cuisine?: string
    authorId?: string
    tags?: string[]
    protein?: string
    mealType?: string
    limit?: number
    offset?: number
  }): Promise<Recipe[]> => {
    const {
      sortBy = "created_at",
      difficulty,
      cuisine,
      authorId,
      tags,
      protein,
      mealType,
      limit = 50,
      offset = 0
    } = options || {}

    let query = supabase
      .from("recipes")
      .select("*")
      .is("deleted_at", null) // Filter soft-deleted recipes

    // Apply filters
    if (difficulty) {
      query = query.eq("difficulty", difficulty)
    }

    if (cuisine) {
      query = query.eq("cuisine", cuisine)
    }

    if (authorId) {
      query = query.eq("author_id", authorId)
    }

    // Apply tags filter (uses GIN index on tags_enum[] array)
    if (tags && tags.length > 0) {
      query = query.contains("tags", tags)
    }

    // Apply protein filter (uses B-tree index on enum)
    if (protein) {
      query = query.eq("protein", protein)
    }

    // Apply meal_type filter (uses B-tree index on enum)
    if (mealType) {
      query = query.eq("meal_type", mealType)
    }

    // Apply sorting (uses B-tree indexes)
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
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
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
    cuisine: string,
    options?: {
      sortBy?: "created_at" | "rating_avg" | "prep_time" | "title"
      limit?: number
      offset?: number
    }
  ): Promise<Recipe[]> => {
    return fetchRecipes({
      ...options,
      cuisine
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

    // Transform Recipe type to DB schema
    const dbRecipe = {
      // Direct mappings
      title: recipe.title,
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      ingredients: recipe.ingredients,
      nutrition: recipe.nutrition,
      author_id: recipe.author_id,
      rating_avg: recipe.rating_avg,
      rating_count: recipe.rating_count,

      // Build content JSONB
      content: {
        description: recipe.content?.description || '',
        image_url: recipe.content?.image_url || null,
        instructions: recipe.content?.instructions || []
      },

      // Map tags array (dietary and allergen tags consolidated)
      tags: recipe.tags?.dietary || [],

      // Map enum fields
      protein: recipe.tags?.protein || null,
      meal_type: recipe.tags?.meal_type || null,
      cuisine: recipe.cuisine_name || 'other',

      // Soft delete defaults
      deleted_at: null
    }

    const { data, error } = await supabase
      .from("recipes")
      .insert(dbRecipe)
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

    // Transform Recipe type to DB schema (only for provided fields)
    const dbUpdates: any = {}

    // Direct mappings
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.prep_time !== undefined) dbUpdates.prep_time = updates.prep_time
    if (updates.cook_time !== undefined) dbUpdates.cook_time = updates.cook_time
    if (updates.servings !== undefined) dbUpdates.servings = updates.servings
    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty
    if (updates.ingredients !== undefined) dbUpdates.ingredients = updates.ingredients
    if (updates.nutrition !== undefined) dbUpdates.nutrition = updates.nutrition
    if (updates.rating_avg !== undefined) dbUpdates.rating_avg = updates.rating_avg
    if (updates.rating_count !== undefined) dbUpdates.rating_count = updates.rating_count

    // Build content JSONB if any content fields are updated
    if (updates.content) {
      // Fetch current content first if partial update
      const { data: currentRecipe } = await supabase
        .from("recipes")
        .select("content")
        .eq("id", id)
        .single()

      const currentContent = currentRecipe?.content || {}

      dbUpdates.content = {
        description:
          updates.content.description !== undefined ? updates.content.description : currentContent.description,
        image_url: updates.content.image_url !== undefined ? updates.content.image_url : currentContent.image_url,
        instructions:
          updates.content.instructions !== undefined ? updates.content.instructions : currentContent.instructions
      }
    }

    // Map tags if provided (dietary and allergen tags consolidated into tags array)
    if (updates.tags) {
      if (updates.tags.dietary !== undefined) {
        dbUpdates.tags = updates.tags.dietary
      }

      if (updates.tags.protein !== undefined) {
        dbUpdates.protein = updates.tags.protein
      }

      if (updates.tags.meal_type !== undefined) {
        dbUpdates.meal_type = updates.tags.meal_type
      }
    }

    // Map cuisine_name if provided
    if (updates.cuisine_name !== undefined) {
      dbUpdates.cuisine = updates.cuisine_name || 'other'
    }

    const { data, error } = await supabase
      .from("recipes")
      .update(dbUpdates)
      .eq("id", id)
      .is("deleted_at", null)
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
   * Delete a recipe (soft delete)
   */
  const deleteRecipe = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from("recipes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)

    if (error) {
      console.error("[Recipe DB] Delete error:", error)
      return false
    }

    console.log("[Recipe DB] Soft delete successful for recipe:", id)
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
      .select("*")
      .is("deleted_at", null)
      .range(offset, offset + limit - 1)

    if (error) {
      console.warn("[Recipe DB] Error searching recipes:", error.message)
      return []
    }

    return (data || [])
      .filter((recipe: any) => {
        const title = recipe.title?.toLowerCase() || ""

        // Search in content.description instead of direct description column
        const content = recipe.content || {}
        const description = content.description?.toLowerCase() || ""

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