"use client"

import { useState, useEffect, useCallback } from "react"
import { mealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe, MealTypeTag } from "@/lib/types"

export function useWeeklyMealPlan(userId: string | undefined, weekIndex: number) {
  const [meals, setMeals] = useState<MealScheduleRow[]>([])
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(false)

  const loadWeeklyMealPlan = useCallback(async () => {
    if (!userId || !weekIndex) return

    setLoading(true)
    try {
      // We need a db function that fetches by weekIndex.
      // For now, we'll just log that we would fetch.

      const mealSchedule = await mealPlannerDB.fetchMealScheduleByWeekIndex(userId, weekIndex)
      setMeals(mealSchedule)

      const recipeIds = Array.from(new Set(mealSchedule.map((m) => m.recipe_id)))
      if (recipeIds.length > 0) {
        const recipes = await mealPlannerDB.fetchRecipesByIds(recipeIds)
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
  }, [userId, weekIndex])

  const addToMealPlan = useCallback(
    async (recipe: Recipe, mealType: MealTypeTag, date: string, options: { reload: boolean } = { reload: true }) => {
      if (!userId) return

      try {
        const result = await mealPlannerDB.addMealToSchedule(
          userId,
          recipe.id,
          date,
          mealType
        )

        if (result && options.reload) {
          // Reload data to reflect changes
          await loadWeeklyMealPlan()
        }
      } catch (error) {
        console.error("[useWeeklyMealPlan] Error adding meal:", error)
        throw error
      }
    },
    [userId, loadWeeklyMealPlan]
  )

  const removeFromMealPlan = useCallback(
    async (mealType: MealTypeTag, date: string, options: { reload: boolean } = { reload: true }) => {
      if (!userId) return

      try {
        const success = await mealPlannerDB.removeMealSlot(
          userId,
          date,
          mealType
        )

        if (success && options.reload) {
          // Reload data to reflect changes
          await loadWeeklyMealPlan()
        }
      } catch (error) {
        console.error("[useWeeklyMealPlan] Error removing meal:", error)
        throw error
      }
    },
    [userId, loadWeeklyMealPlan]
  )

  const clearWeek = useCallback(
    async () => {
      if (!userId || !weekIndex) return false

      try {
        const success = await mealPlannerDB.clearWeekSchedule(userId, weekIndex)

        if (success) {
          // Reload data to reflect changes
          await loadWeeklyMealPlan()
        }

        return success
      } catch (error) {
        console.error("[useWeeklyMealPlan] Error clearing week:", error)
        throw error
      }
    },
    [userId, weekIndex, loadWeeklyMealPlan]
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
    clearWeek,
  }
}
