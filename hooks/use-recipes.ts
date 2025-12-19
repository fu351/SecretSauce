"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine: string
  image_url: string
  dietary_tags: string[]
  dietary_flags: any
  ingredients: any[]
  instructions: string[]
  author_id: string
  created_at: string
  rating_avg: number
  rating_count: number
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

export type SortBy = "created_at" | "rating_avg" | "prep_time" | "title"

/**
 * Fetch all recipes with optional sorting
 * Cached for 5 minutes, background refetch on window focus
 */
export function useRecipes(sortBy: SortBy = "created_at") {
  return useQuery({
    queryKey: ["recipes", sortBy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, description, prep_time, cook_time, servings, difficulty, cuisine, image_url, dietary_tags, ingredients, nutrition, rating_avg, rating_count, created_at, author_id"
        )
        .order(sortBy, { ascending: sortBy === "created_at" ? false : true })

      if (error) {
        console.warn("Error fetching recipes:", error.message)
        return []
      }

      return (data || []) as Recipe[]
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Fetch recipes by a specific author
 * Cached for 3 minutes (user's own recipes change more frequently)
 */
export function useUserRecipes(userId: string | null) {
  return useQuery({
    queryKey: ["recipes", "user", userId],
    queryFn: async () => {
      if (!userId) return []

      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, description, image_url, difficulty, prep_time, cook_time, rating_avg, rating_count, dietary_tags, nutrition"
        )
        .eq("author_id", userId)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching user recipes:", error)
        return []
      }

      return (data || []) as Recipe[]
    },
    enabled: !!userId, // Only run query if userId exists
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Fetch a single recipe by ID
 * Cached for 10 minutes (individual recipes change rarely)
 */
export function useRecipe(recipeId: string | null) {
  return useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: async () => {
      if (!recipeId) return null

      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", recipeId)
        .single()

      if (error) {
        console.error("Error fetching recipe:", error)
        return null
      }

      return data as Recipe
    },
    enabled: !!recipeId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })
}

/**
 * Fetch user's favorite recipe IDs
 * Cached for 2 minutes (favorites change more frequently)
 */
export function useFavorites(userId: string | null) {
  return useQuery({
    queryKey: ["favorites", userId],
    queryFn: async () => {
      if (!userId) return new Set<string>()

      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", userId)

      if (error) {
        console.warn("Error fetching favorites:", error)
        return new Set<string>()
      }

      return new Set(data?.map((item) => item.recipe_id) || [])
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Toggle favorite status for a recipe
 * Automatically updates the favorites cache
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
      if (isFavorited) {
        // Remove favorite
        const { error } = await supabase
          .from("recipe_favorites")
          .delete()
          .eq("recipe_id", recipeId)
          .eq("user_id", userId)

        if (error) throw error
        return { action: "removed", recipeId }
      } else {
        // Add favorite
        const { error } = await supabase
          .from("recipe_favorites")
          .insert({ recipe_id: recipeId, user_id: userId })

        if (error) throw error
        return { action: "added", recipeId }
      }
    },
    onMutate: async ({ recipeId, userId, isFavorited }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["favorites", userId] })

      // Snapshot previous value
      const previousFavorites = queryClient.getQueryData<Set<string>>(["favorites", userId])

      // Optimistically update favorites
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
      // Rollback on error
      if (context?.previousFavorites) {
        queryClient.setQueryData(["favorites", variables.userId], context.previousFavorites)
      }
    },
    onSettled: (data, error, variables) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["favorites", variables.userId] })
    },
  })
}
