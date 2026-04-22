"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { mealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import { useAnalytics } from "@/hooks/use-analytics"
import type { Recipe } from "@/lib/types"

type PlannerMealType = MealScheduleRow["meal_type"]

export function useWeeklyMealPlan(userId: string | undefined, weekIndex: number) {
  const [meals, setMeals] = useState<MealScheduleRow[]>([])
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(false)
  const { trackEvent } = useAnalytics()
  const inFlightKeyRef = useRef<string | null>(null)

  const loadWeeklyMealPlan = useCallback(async () => {
    if (!userId || !weekIndex) return

    const key = `${userId}:${weekIndex}`
    if (inFlightKeyRef.current === key) return
    inFlightKeyRef.current = key

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
      if (inFlightKeyRef.current === key) {
        inFlightKeyRef.current = null
      }
      setLoading(false)
    }
  }, [userId, weekIndex])

  const addToMealPlan = useCallback(
    async (recipe: Recipe, mealType: PlannerMealType, date: string, options: { reload: boolean } = { reload: true }) => {
      if (!userId) return

      if (options.reload) {
        try {
          const result = await mealPlannerDB.addMealToSchedule(
            userId,
            recipe.id,
            date,
            mealType
          )
          if (result) {
            trackEvent("meal_added_to_plan", { recipe_id: recipe.id, date, meal_type: mealType as "breakfast" | "lunch" | "dinner" })
            await loadWeeklyMealPlan()
          }
        } catch (error) {
          console.error("[useWeeklyMealPlan] Error adding meal:", error)
          throw error
        }
        return
      }

      // Optimistic add: show the tile in the new slot immediately, then sync with DB
      const tempId = `opt-${recipe.id}-${date}-${mealType}`
      const syntheticRow: MealScheduleRow = {
        id: tempId,
        user_id: userId,
        recipe_id: recipe.id,
        date,
        meal_type: mealType,
        created_at: null,
        updated_at: null,
        week_index: null,
      }
      setMeals((prev) => [...prev, syntheticRow])
      setRecipesById((prev) => ({ ...prev, [recipe.id]: recipe }))

      try {
        const result = await mealPlannerDB.addMealToSchedule(
          userId,
          recipe.id,
          date,
          mealType
        )
        if (result) {
          trackEvent("meal_added_to_plan", { recipe_id: recipe.id, date, meal_type: mealType as "breakfast" | "lunch" | "dinner" })
          setMeals((prev) =>
            prev.map((m) => (m.id === tempId ? result : m))
          )
        } else {
          setMeals((prev) => prev.filter((m) => m.id !== tempId))
        }
      } catch (error) {
        setMeals((prev) => prev.filter((m) => m.id !== tempId))
        console.error("[useWeeklyMealPlan] Error adding meal:", error)
        throw error
      }
    },
    [userId, loadWeeklyMealPlan, trackEvent]
  )

  const removeFromMealPlan = useCallback(
    async (mealType: PlannerMealType, date: string, options: { reload: boolean } = { reload: true }) => {
      if (!userId) return

      if (options.reload) {
        try {
          const success = await mealPlannerDB.removeMealSlot(userId, date, mealType)
          if (success) {
            trackEvent("meal_removed_from_plan", { meal_id: `${date}-${mealType}` })
            await loadWeeklyMealPlan()
          }
        } catch (error) {
          console.error("[useWeeklyMealPlan] Error removing meal:", error)
          throw error
        }
        return
      }

      const mealToRemove = meals.find((m) => m.date === date && m.meal_type === mealType)
      trackEvent("meal_removed_from_plan", { meal_id: mealToRemove?.id ?? `${date}-${mealType}`, recipe_id: mealToRemove?.recipe_id })
      setMeals((prev) =>
        prev.filter((m) => !(m.date === date && m.meal_type === mealType))
      )

      try {
        await mealPlannerDB.removeMealSlot(userId, date, mealType)
      } catch (error) {
        await loadWeeklyMealPlan()
        console.error("[useWeeklyMealPlan] Error removing meal:", error)
        throw error
      }
    },
    [userId, meals, loadWeeklyMealPlan, trackEvent]
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
