"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { recipeDB } from "@/lib/database/recipe-db"

export type SortBy = "created_at" | "rating_avg" | "prep_time" | "title"

interface RecipeFilters {
  difficulty?: string
  cuisine?: string
  diet?: string
  search?: string
  limit?: number
}

/**
 * Fetch recipes with efficient database-level filtering
 * Uses indexes added in migration 0001_add_recipe_search_indexes.sql
 *
 * Benefits:
 * - Pushes filtering to database instead of JavaScript
 * - Uses GIN index for ingredient search
 * - Uses B-tree indexes for categorical filters
 * - Only loads matching recipes (with limit/pagination)
 *
 * Performance improvement: 10-100x faster than filtering all recipes in JS
 */
export function useRecipesFiltered(
  sortBy: SortBy = "created_at",
  filters?: RecipeFilters
) {
  const { difficulty, cuisine, diet, search, limit = 50 } = filters || {}

  return useQuery({
    queryKey: ["recipes", sortBy, difficulty, cuisine, diet, search],
    queryFn: async () => {
      // If search is provided, use search function
      if (search && search.trim()) {
        return recipeDB.searchRecipes(search, { limit })
      }

      // Otherwise use filtered fetch with categorical filters
      const cuisineValue = cuisine && cuisine !== "all" ? cuisine : undefined
      const tags = diet && diet !== "all" ? [diet] : undefined

      return recipeDB.fetchRecipes({
        sortBy,
        difficulty: difficulty && difficulty !== "all" ? difficulty : undefined,
        cuisine: cuisineValue,
        tags,
        limit
      })
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Fetch all recipes with optional sorting
 * Uses database indexes for efficient ordering
 */
export function useRecipes(sortBy: SortBy = "created_at") {

  return useQuery({
    queryKey: ["recipes", sortBy],
    queryFn: async () => {
      return recipeDB.fetchRecipes({ sortBy })
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Fetch recipes by a specific author
 * Uses idx_recipes_author_created composite index for performance
 */
export function useUserRecipes(userId: string | null) {

  return useQuery({
    queryKey: ["recipes", "user", userId],
    queryFn: async () => {
      if (!userId) return []
      return recipeDB.fetchRecipesByAuthor(userId, { sortBy: "created_at" })
    },
    enabled: !!userId,
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Fetch a single recipe by ID
 */
export function useRecipe(recipeId: string | null) {

  return useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: async () => {
      if (!recipeId) return null
      return recipeDB.fetchRecipeById(recipeId)
    },
    enabled: !!recipeId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })
}

/**
 * Fetch user's favorite recipe IDs
 */
export function useFavorites(userId: string | null) {
  return useQuery({
    queryKey: ["favorites", userId],
    queryFn: async () => {
      if (!userId) return new Set<string>()

      const { recipeFavoritesDB } = await import("@/lib/database/recipe-favorites-db")
      const favoriteIds = await recipeFavoritesDB.fetchFavoriteRecipeIds(userId)
      return new Set(favoriteIds)
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Toggle favorite status for a recipe
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      recipeId,
      userId,
      isFavorited,
    }: {
      recipeId: string
      userId: string
      isFavorited: boolean
    }) => {
      const { recipeFavoritesDB } = await import("@/lib/database/recipe-favorites-db")

      if (isFavorited) {
        const success = await recipeFavoritesDB.removeFavorite(userId, recipeId)
        if (!success) throw new Error("Failed to remove favorite")
        return { action: "removed", recipeId }
      } else {
        const result = await recipeFavoritesDB.addFavorite(userId, recipeId)
        if (!result) throw new Error("Failed to add favorite")
        return { action: "added", recipeId }
      }
    },
    onMutate: async ({ recipeId, userId, isFavorited }) => {
      await queryClient.cancelQueries({ queryKey: ["favorites", userId] })
      const previousFavorites = queryClient.getQueryData<Set<string>>(["favorites", userId])

      queryClient.setQueryData<Set<string>>(["favorites", userId], (old) => {
        const newSet = new Set(old || [])
        if (isFavorited) {
          newSet.delete(recipeId)
        } else {
          newSet.add(recipeId)
        }
        return newSet
      })

      return { previousFavorites }
    },
    onError: (err, variables, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(["favorites", variables.userId], context.previousFavorites)
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["favorites", variables.userId] })
    },
  })
}

/**
 * Standardize recipe ingredients by mapping them to canonical grocery items
 * Used after uploading or editing a recipe to ensure consistent ingredient mapping
 */
export function useStandardizeRecipeIngredients() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      recipeId,
      ingredients,
    }: {
      recipeId: string
      ingredients: any[]
    }) => {
      const response = await fetch("/api/ingredients/standardize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "recipe",
          recipeId,
          ingredients: ingredients.map((ingredient, index) => ({
            ...ingredient,
            id: index,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to standardize ingredients")
      }

      const payload = await response.json()
      return payload
    },
    onSuccess: (data, { recipeId }) => {
      // Invalidate recipe cache to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] })
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
    },
  })
}