"use client"

import { useState, useEffect, useCallback } from "react"
import { useMealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"

export function useWeeklyMealPlan(userId: string | undefined, weekIndex: number) {
  const db = useMealPlannerDB()
  const [meals, setMeals] = useState<MealScheduleRow[]>([])
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(false)

  const loadWeeklyMealPlan = useCallback(async () => {
    if (!userId || !weekIndex) return

    setLoading(true)
    try {
      // We need a db function that fetches by weekIndex.
      // For now, we'll just log that we would fetch.
      console.log(`[useWeeklyMealPlan] Fetching week ${weekIndex} for user ${userId}`)

      const mealSchedule = await db.fetchMealScheduleByWeekIndex(userId, weekIndex)
      setMeals(mealSchedule)

      const recipeIds = Array.from(new Set(mealSchedule.map((m) => m.recipe_id)))
      if (recipeIds.length > 0) {
        const recipes = await db.fetchRecipesByIds(recipeIds)
        const recipesMap: Record<string, Recipe> = {}
        recipes.forEach((r) => {
          recipesMap[r.id] = r
        })
        setRecipesById(recipesMap)
      } else {
        setRecipesById({})
      }
    } catch (error) {
      console.error("[useWeeklyMealPlan] Error loading weekly meal plan:", error)
    } finally {
      setLoading(false)
    }
  }, [userId, weekIndex, db])

  const addToMealPlan = useCallback(
    async (recipe: Recipe, mealType: string, date: string) => {
      if (!userId) return

      try {
        const result = await db.addMealToSchedule(
          userId,
          recipe.id,
          date,
          mealType as "breakfast" | "lunch" | "dinner"
        )

        if (result) {
          // Reload data to reflect changes
          loadWeeklyMealPlan()
        }
      } catch (error) {
        console.error("[useWeeklyMealPlan] Error adding meal:", error)
        throw error
      }
    },
    [userId, db, loadWeeklyMealPlan]
  )

  const removeFromMealPlan = useCallback(
    async (mealType: string, date: string) => {
      if (!userId) return

      try {
        const success = await db.removeMealSlot(
          userId,
          date,
          mealType as "breakfast" | "lunch" | "dinner"
        )

        if (success) {
          // Reload data to reflect changes
          loadWeeklyMealPlan()
        }
      } catch (error) {
        console.error("[useWeeklyMealPlan] Error removing meal:", error)
        throw error
      }
    },
    [userId, db, loadWeeklyMealPlan]
  )

  useEffect(() => {
    loadWeeklyMealPlan()
  }, [loadWeeklyMealPlan])

  return {
    meals,
    recipesById,
    loading,
    reload: loadWeeklyMealPlan,
    addToMealPlan,
    removeFromMealPlan,
  }
}
