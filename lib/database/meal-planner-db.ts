"use client"

import { useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"
import { Recipe } from "@/lib/types"
import { getMealPlannerCache } from "./meal-planner-cache"
import { getWeek, getYear, eachDayOfInterval, parseISO } from "date-fns"

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
  week_index: number
}

function getWeekIndex(date: Date): number {
  const year = getYear(date)
  const week = getWeek(date, { weekStartsOn: 1 })
  return year * 100 + week
}

function getWeekIndicesForRange(startDate: string, endDate: string): number[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const allDates = eachDayOfInterval({ start, end })
  const weekIndices = allDates.map(getWeekIndex)
  return Array.from(new Set(weekIndices))
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

      const weekIndices = getWeekIndicesForRange(startDate, endDate)

      const { data, error } = await supabase
        .from("meal_schedule")
        .select("*")
        .eq("user_id", userId)
        .in("week_index", weekIndices)
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

  const fetchMealScheduleByWeekIndex = useCallback(
    async (userId: string, weekIndex: number): Promise<MealScheduleRow[]> => {
      // For caching, we can just use the weekIndex as a key.
      // However, the existing cache is by date range. We'll skip caching for now
      // and let the parent hook handle it if needed.
      console.log("[Meal Planner DB] Fetching meal schedule by week:", { userId, weekIndex })

      const { data, error } = await supabase
        .from("meal_schedule")
        .select("*")
        .eq("user_id", userId)
        .eq("week_index", weekIndex)
        .order("date", { ascending: true })

      if (error) {
        console.error("[Meal Planner DB] Error fetching meal schedule by week:", error)
        return []
      }

      return data || []
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

      // Invalidate meal schedule cache after updating
      if (data) {
        const cache = getMealPlannerCache()
        cache.invalidateMealScheduleCache(data.user_id)
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

      // Fetch the meal first to get userId for cache invalidation
      const { data: mealData } = await supabase
        .from("meal_schedule")
        .select("user_id")
        .eq("id", mealId)
        .single()

      const { error } = await supabase.from("meal_schedule").delete().eq("id", mealId)

      if (error) {
        console.error("[Meal Planner DB] Error removing meal from schedule:", error)
        return false
      }

      // Invalidate meal schedule cache after removing
      if (mealData) {
        const cache = getMealPlannerCache()
        cache.invalidateMealScheduleCache(mealData.user_id)
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
   * @deprecated Use useRecipeFavoritesDB().fetchFavoriteRecipes() instead
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
        console.log("[Meal Planner DB] Favorites table not available or relationship not configured:", error.message)
        return []
      }
      console.error("[Meal Planner DB] Error fetching favorites:", error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Extract and map recipes from the joined result
    const result = data
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

  return useMemo(
    () => ({
      fetchMealScheduleByDateRange,
      fetchMealScheduleByDate,
      fetchRecipesByIds,
      addMealToSchedule,
      updateMealInSchedule,
      removeMealFromSchedule,
      removeMealSlot,
      fetchFavoriteRecipes,
      fetchSuggestedRecipes,
      fetchMealScheduleByWeekIndex,
    }),
    [
      fetchMealScheduleByDateRange,
      fetchMealScheduleByDate,
      fetchRecipesByIds,
      addMealToSchedule,
      updateMealInSchedule,
      removeMealFromSchedule,
      removeMealSlot,
      fetchFavoriteRecipes,
      fetchSuggestedRecipes,
      fetchMealScheduleByWeekIndex,
    ]
  )
}

