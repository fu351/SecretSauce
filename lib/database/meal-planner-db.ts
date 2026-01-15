"use client"

import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"
import { Recipe } from "@/lib/types"

export type MealPlannerDB = Database["public"]["Tables"]["meal_plans"]["Row"]

interface MealEntry {
  meal_type: "breakfast" | "lunch" | "dinner"
  date: string
  recipe_id: string
}

interface MealPlan {
  id: string
  week_start: string
  meals: MealEntry[]
  shopping_list: any
  total_budget: number
  created_at: string
  updated_at: string
}

export function useMealPlannerDB() {
  /**
   * Fetch meal plan for a specific week
   */
  const fetchMealPlanByWeek = useCallback(
    async (userId: string, weekStart: string): Promise<MealPlan | null> => {
      console.log("[Meal Planner DB] Fetching meal plan for week:", { userId, weekStart })

      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle()

      if (error && error.code !== "PGRST116") {
        console.error("[Meal Planner DB] Error fetching meal plan:", error)
        return null
      }

      if (!data) {
        console.log("[Meal Planner DB] No meal plan found for week:", weekStart)
        return null
      }

      return data
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

    console.log("[Meal Planner DB] Fetching recipes:", { count: recipeIds.length })

    const { data, error } = await supabase.from("recipes").select("*").in("id", recipeIds)

    if (error) {
      console.error("[Meal Planner DB] Error fetching recipes:", error)
      return []
    }

    return data || []
  }, [])

  /**
   * Create a new meal plan
   */
  const createMealPlan = useCallback(
    async (userId: string, weekStart: string, meals: MealEntry[]): Promise<MealPlan | null> => {
      console.log("[Meal Planner DB] Creating meal plan:", { userId, weekStart, mealCount: meals.length })

      const { data, error } = await supabase
        .from("meal_plans")
        .insert({
          user_id: userId,
          week_start: weekStart,
          meals,
        })
        .select()
        .single()

      if (error) {
        console.error("[Meal Planner DB] Error creating meal plan:", error)
        return null
      }

      return data
    },
    []
  )

  /**
   * Update existing meal plan
   */
  const updateMealPlan = useCallback(
    async (planId: string, meals: MealEntry[]): Promise<MealPlan | null> => {
      console.log("[Meal Planner DB] Updating meal plan:", { planId, mealCount: meals.length })

      const { data, error } = await supabase.from("meal_plans").update({ meals }).eq("id", planId).select().single()

      if (error) {
        console.error("[Meal Planner DB] Error updating meal plan:", error)
        return null
      }

      return data
    },
    []
  )

  /**
   * Add a single meal to the plan
   */
  const addMealToWeek = useCallback(
    async (userId: string, weekStart: string, meal: MealEntry): Promise<MealPlan | null> => {
      console.log("[Meal Planner DB] Adding meal to week:", { userId, weekStart, mealType: meal.meal_type, date: meal.date })

      // Fetch current plan
      const currentPlan = await fetchMealPlanByWeek(userId, weekStart)
      let meals: MealEntry[] = currentPlan?.meals || []

      // Remove existing meal for this slot
      meals = meals.filter((m) => !(m.date === meal.date && m.meal_type === meal.meal_type))

      // Add new meal
      meals.push(meal)

      // Update or create
      if (currentPlan?.id) {
        return updateMealPlan(currentPlan.id, meals)
      } else {
        return createMealPlan(userId, weekStart, meals)
      }
    },
    [fetchMealPlanByWeek, updateMealPlan, createMealPlan]
  )

  /**
   * Remove a meal from the plan
   */
  const removeMealFromWeek = useCallback(
    async (userId: string, weekStart: string, mealType: string, date: string): Promise<MealPlan | null> => {
      console.log("[Meal Planner DB] Removing meal from week:", { userId, weekStart, mealType, date })

      const currentPlan = await fetchMealPlanByWeek(userId, weekStart)
      if (!currentPlan?.id) {
        console.warn("[Meal Planner DB] No meal plan found to remove meal from")
        return null
      }

      let meals: MealEntry[] = currentPlan.meals || []
      meals = meals.filter((m) => !(m.date === date && m.meal_type === mealType))

      return updateMealPlan(currentPlan.id, meals)
    },
    [fetchMealPlanByWeek, updateMealPlan]
  )

  /**
   * Fetch user's favorite recipes using batch query with relationship join
   */
  const fetchFavoriteRecipes = useCallback(async (userId: string): Promise<Recipe[]> => {
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
    return data.map((item: any) => item.recipes).filter(Boolean)
  }, [])

  /**
   * Fetch suggested recipes
   */
  const fetchSuggestedRecipes = useCallback(async (limit: number = 20): Promise<Recipe[]> => {
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

    return data || []
  }, [])

  return {
    fetchMealPlanByWeek,
    fetchRecipesByIds,
    createMealPlan,
    updateMealPlan,
    addMealToWeek,
    removeMealFromWeek,
    fetchFavoriteRecipes,
    fetchSuggestedRecipes,
  }
}
