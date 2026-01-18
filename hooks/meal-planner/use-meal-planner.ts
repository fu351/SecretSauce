"use client"

import { useState, useCallback } from "react"
import { useMealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"

export function useMealPlanner(userId: string | undefined, weekDates: string[]) {
  const db = useMealPlannerDB()
  const [meals, setMeals] = useState<MealScheduleRow[]>([])
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(false)

  const loadMealPlan = useCallback(async () => {
    if (!userId || weekDates.length === 0) return

    setLoading(true)
    try {
      const startDate = weekDates[0]
      const endDate = weekDates[weekDates.length - 1]
      const mealSchedule = await db.fetchMealScheduleByDateRange(userId, startDate, endDate)

      if (!mealSchedule || mealSchedule.length === 0) {
        setMeals([])
        setRecipesById({})
        return
      }

      setMeals(mealSchedule)

      const recipeIds = Array.from(new Set(mealSchedule.map((m) => m.recipe_id)))

      if (recipeIds.length === 0) {
        setRecipesById({})
        return
      }

      const recipes = await db.fetchRecipesByIds(recipeIds)
      const recipesMap: Record<string, Recipe> = {}
      recipes.forEach((r) => {
        recipesMap[r.id] = r
      })
      setRecipesById(recipesMap)
    } catch (error) {
      console.error("[Meal Planner Hook] Error loading meal plan:", error)
      setMeals([])
      setRecipesById({})
    } finally {
      setLoading(false)
    }
  }, [userId, weekDates, db])

  const addToMealPlan = useCallback(
    async (recipe: Recipe, mealType: string, date: string) => {
      if (!userId) return

      try {
        await db.addMealToSchedule(userId, recipe.id, date, mealType as "breakfast" | "lunch" | "dinner")

        // Update local state
        setRecipesById((prev) => ({ ...prev, [recipe.id]: recipe }))

        // Reload to ensure sync
        await loadMealPlan()
      } catch (error) {
        console.error("[Meal Planner Hook] Error adding meal:", error)
        throw error
      }
    },
    [userId, db, loadMealPlan]
  )

  const removeFromMealPlan = useCallback(
    async (mealType: string, date: string) => {
      if (!userId) return

      try {
        await db.removeMealSlot(userId, date, mealType as "breakfast" | "lunch" | "dinner")

        // Reload to ensure sync
        await loadMealPlan()
      } catch (error) {
        console.error("[Meal Planner Hook] Error removing meal:", error)
        throw error
      }
    },
    [userId, db, loadMealPlan]
  )

  const loadAllData = useCallback(async () => {
    await loadMealPlan()
  }, [loadMealPlan])

  return {
    meals,
    recipesById,
    loading,
    loadMealPlan,
    loadAllData,
    addToMealPlan,
    removeFromMealPlan,
  }
}
