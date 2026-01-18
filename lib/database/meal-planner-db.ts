"use client"

import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"
import { Recipe } from "@/lib/types"
import { getMealPlannerCache } from "./meal-planner-cache"

export type MealScheduleRow = Database["public"]["Tables"]["meal_schedule"]["Row"]
export type MealScheduleInsert = Database["public"]["Tables"]["meal_schedule"]["Insert"]
export type MealScheduleUpdate = Database["public"]["Tables"]["meal_schedule"]["Update"]

interface MealScheduleEntry {
  id: string
  user_id: string
  recipe_id: string
  date: string
  meal_type: "breakfast" | "lunch" | "dinner"
  created_at: string
  updated_at: string
}

export function useMealPlannerDB() {
  /**
   * Fetch meal schedule entries for a specific date range
   */
  const fetchMealScheduleByDateRange = useCallback(
    async (userId: string, startDate: string, endDate: string): Promise<MealScheduleRow[]> => {
      const cache = getMealPlannerCache()
      const cached = cache.getMealScheduleCache(userId, startDate, endDate)

      if (cached) {
        return cached
      }

      console.log("[Meal Planner DB] Fetching meal schedule:", { userId, startDate, endDate })

      const { data, error } = await supabase
        .from("meal_schedule")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })

      if (error) {
        console.error("[Meal Planner DB] Error fetching meal schedule:", error)
        return []
      }

      const result = data || []
      cache.setMealScheduleCache(userId, startDate, endDate, result)
      return result
    },
    []
  )

  /**
   * Fetch meal schedule for a specific date
   */
  const fetchMealScheduleByDate = useCallback(
    async (userId: string, date: string): Promise<MealScheduleRow[]> => {
      console.log("[Meal Planner DB] Fetching meals for date:", { userId, date })

      const { data, error } = await supabase
        .from("meal_schedule")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("meal_type", { ascending: true })

      if (error) {
        console.error("[Meal Planner DB] Error fetching meals for date:", error)
        return []
      }

      return data || []
    },
    []
  )

  /**
   * Fetch recipes by their IDs
   */
  const fetchRecipesByIds = useCallback(async (recipeIds: string[]): Promise<Recipe[]> => {
    if (recipeIds.length === 0) {
      return []
    }

    const cache = getMealPlannerCache()
    const cached = cache.getRecipesCache(recipeIds)

    if (cached) {
      return cached
    }

    console.log("[Meal Planner DB] Fetching recipes:", { count: recipeIds.length })

    const { data, error } = await supabase.from("recipes").select("*").in("id", recipeIds)

    if (error) {
      console.error("[Meal Planner DB] Error fetching recipes:", error)
      return []
    }

    const result = data || []
    cache.setRecipesCache(recipeIds, result)
    return result
  }, [])

  /**
   * Add a meal to the schedule
   */
  const addMealToSchedule = useCallback(
    async (userId: string, recipeId: string, date: string, mealType: "breakfast" | "lunch" | "dinner"): Promise<MealScheduleRow | null> => {
      console.log("[Meal Planner DB] Adding meal to schedule:", { userId, recipeId, date, mealType })

      const { data, error } = await supabase
        .from("meal_schedule")
        .insert({
          user_id: userId,
          recipe_id: recipeId,
          date,
          meal_type: mealType,
        })
        .select()
        .single()

      if (error) {
        console.error("[Meal Planner DB] Error adding meal to schedule:", error)
        return null
      }

      // Invalidate meal schedule cache after adding
      const cache = getMealPlannerCache()
      cache.invalidateMealScheduleCache(userId)

      return data
    },
    []
  )

  /**
   * Update a meal in the schedule
   */
  const updateMealInSchedule = useCallback(
    async (mealId: string, recipeId: string, mealType: "breakfast" | "lunch" | "dinner"): Promise<MealScheduleRow | null> => {
      console.log("[Meal Planner DB] Updating meal in schedule:", { mealId, recipeId, mealType })

      const { data, error } = await supabase
        .from("meal_schedule")
        .update({
          recipe_id: recipeId,
          meal_type: mealType,
        })
        .eq("id", mealId)
        .select()
        .single()

      if (error) {
        console.error("[Meal Planner DB] Error updating meal in schedule:", error)
        return null
      }

      return data
    },
    []
  )

  /**
   * Remove a meal from the schedule
   */
  const removeMealFromSchedule = useCallback(
    async (mealId: string): Promise<boolean> => {
      console.log("[Meal Planner DB] Removing meal from schedule:", { mealId })

      const { error } = await supabase.from("meal_schedule").delete().eq("id", mealId)

      if (error) {
        console.error("[Meal Planner DB] Error removing meal from schedule:", error)
        return false
      }

      return true
    },
    []
  )

  /**
   * Remove all meals for a specific date and meal type
   */
  const removeMealSlot = useCallback(
    async (userId: string, date: string, mealType: "breakfast" | "lunch" | "dinner"): Promise<boolean> => {
      console.log("[Meal Planner DB] Removing meal slot:", { userId, date, mealType })

      const { error } = await supabase
        .from("meal_schedule")
        .delete()
        .eq("user_id", userId)
        .eq("date", date)
        .eq("meal_type", mealType)

      if (error) {
        console.error("[Meal Planner DB] Error removing meal slot:", error)
        return false
      }

      // Invalidate meal schedule cache after removing
      const cache = getMealPlannerCache()
      cache.invalidateMealScheduleCache(userId)

      return true
    },
    []
  )

  /**
   * Fetch user's favorite recipes using batch query with relationship join
   */
  const fetchFavoriteRecipes = useCallback(async (userId: string): Promise<Recipe[]> => {
    const cache = getMealPlannerCache()
    const cached = cache.getFavoriteRecipesCache(userId)

    if (cached) {
      return cached
    }

    console.log("[Meal Planner DB] Fetching favorite recipes for user:", userId)

    // Single batch query using relationship join - more efficient than two separate queries
    const { data, error } = await supabase
      .from("recipe_favorites")
      .select(`
        recipes (
          id,
          title,
          description,
          image_url,
          prep_time,
          cook_time,
          servings,
          difficulty,
          rating_avg,
          rating_count,
          tags,
          dietary_tags,
          nutrition,
          ingredients,
          instructions,
          created_at,
          updated_at
        )
      `)
      .eq("user_id", userId)

    if (error) {
      // Table might not exist in test environment
      if (error.code === "PGRST116" || error.message?.includes("relation")) {
        console.log("[Meal Planner DB] Favorites table not available")
        return []
      }
      console.error("[Meal Planner DB] Error fetching favorites:", error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Extract recipes from the joined result
    const result = data.map((item: any) => item.recipes).filter(Boolean)
    cache.setFavoriteRecipesCache(userId, result)
    return result
  }, [])

  /**
   * Fetch suggested recipes
   */
  const fetchSuggestedRecipes = useCallback(async (limit: number = 20): Promise<Recipe[]> => {
    const cache = getMealPlannerCache()
    const cached = cache.getSuggestedRecipesCache()

    if (cached) {
      return cached
    }

    console.log("[Meal Planner DB] Fetching suggested recipes:", { limit })

    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .limit(limit)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[Meal Planner DB] Error fetching suggested recipes:", error)
      return []
    }

    const result = data || []
    cache.setSuggestedRecipesCache(result)
    return result
  }, [])

  return {
    fetchMealScheduleByDateRange,
    fetchMealScheduleByDate,
    fetchRecipesByIds,
    addMealToSchedule,
    updateMealInSchedule,
    removeMealFromSchedule,
    removeMealSlot,
    fetchFavoriteRecipes,
    fetchSuggestedRecipes,
  }
}
