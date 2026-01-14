"use client"

import { useState, useCallback } from "react"
import { useMealPlannerDB } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"

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

export function useMealPlanner(userId: string | undefined, weekDates: string[]) {
  const db = useMealPlannerDB()
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(false)

  const loadMealPlan = useCallback(async () => {
    if (!userId || weekDates.length === 0) return

    setLoading(true)
    try {
      const weekStart = weekDates[0]
      const plan = await db.fetchMealPlanByWeek(userId, weekStart)

      if (!plan) {
        setMealPlan(null)
        setRecipesById({})
        return
      }

      setMealPlan(plan)

      const meals: MealEntry[] = plan.meals || []
      const recipeIds = Array.from(new Set(meals.map((m) => m.recipe_id)))

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
      setMealPlan(null)
      setRecipesById({})
    } finally {
      setLoading(false)
    }
  }, [userId, weekDates, db])

  const addToMealPlan = useCallback(
    async (recipe: Recipe, mealType: string, date: string) => {
      if (!userId || weekDates.length === 0) return

      try {
        const weekStart = weekDates[0]
        const mealEntry: MealEntry = {
          meal_type: mealType as MealEntry["meal_type"],
          date,
          recipe_id: recipe.id,
        }

        const updatedPlan = await db.addMealToWeek(userId, weekStart, mealEntry)

        // Update local state
        setRecipesById((prev) => ({ ...prev, [recipe.id]: recipe }))

        // Reload to ensure sync
        await loadMealPlan()
      } catch (error) {
        console.error("[Meal Planner Hook] Error adding meal:", error)
        throw error
      }
    },
    [userId, weekDates, db, loadMealPlan]
  )

  const removeFromMealPlan = useCallback(
    async (mealType: string, date: string) => {
      if (!userId || weekDates.length === 0) return

      try {
        const weekStart = weekDates[0]
        await db.removeMealFromWeek(userId, weekStart, mealType, date)

        // Reload to ensure sync
        await loadMealPlan()
      } catch (error) {
        console.error("[Meal Planner Hook] Error removing meal:", error)
        throw error
      }
    },
    [userId, weekDates, db, loadMealPlan]
  )

  const loadAllData = useCallback(async () => {
    await loadMealPlan()
  }, [loadMealPlan])

  return {
    mealPlan,
    recipesById,
    loading,
    loadMealPlan,
    loadAllData,
    addToMealPlan,
    removeFromMealPlan,
  }
}
