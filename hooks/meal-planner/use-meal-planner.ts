"use client"

import { useState, useCallback, useRef } from "react"
import { useMealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"

export function useMealPlanner(userId: string | undefined, dates: string[]) {
  const db = useMealPlannerDB()
  const [meals, setMeals] = useState<MealScheduleRow[]>([])
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(false)
  const loadedRangeRef = useRef<{ start: string; end: string } | null>(null)
  const loadingRef = useRef(false)

  const loadMealPlan = useCallback(async () => {
    if (!userId || dates.length === 0) return

    const newStart = dates[0]
    const newEnd = dates[dates.length - 1]
    const loadedRange = loadedRangeRef.current

    // Skip if already loading
    if (loadingRef.current) return

    // Determine what ranges need to be fetched
    let rangesToFetch: { start: string; end: string }[] = []

    if (!loadedRange) {
      // First load - fetch entire range
      rangesToFetch = [{ start: newStart, end: newEnd }]
    } else {
      // Incremental load - only fetch new ranges
      if (newStart < loadedRange.start) {
        // Need to fetch earlier dates
        const dayBefore = new Date(loadedRange.start)
        dayBefore.setDate(dayBefore.getDate() - 1)
        rangesToFetch.push({ start: newStart, end: dayBefore.toISOString().split("T")[0] })
      }
      if (newEnd > loadedRange.end) {
        // Need to fetch later dates
        const dayAfter = new Date(loadedRange.end)
        dayAfter.setDate(dayAfter.getDate() + 1)
        rangesToFetch.push({ start: dayAfter.toISOString().split("T")[0], end: newEnd })
      }
    }

    if (rangesToFetch.length === 0) return

    loadingRef.current = true
    setLoading(true)

    try {
      // Fetch all new ranges
      const newMeals: MealScheduleRow[] = []
      for (const range of rangesToFetch) {
        const mealSchedule = await db.fetchMealScheduleByDateRange(userId, range.start, range.end)
        if (mealSchedule) {
          newMeals.push(...mealSchedule)
        }
      }

      // Update loaded range
      loadedRangeRef.current = {
        start: loadedRange ? (newStart < loadedRange.start ? newStart : loadedRange.start) : newStart,
        end: loadedRange ? (newEnd > loadedRange.end ? newEnd : loadedRange.end) : newEnd,
      }

      // Merge new meals with existing
      setMeals((prev) => {
        const existingIds = new Set(prev.map((m) => m.id))
        const uniqueNewMeals = newMeals.filter((m) => !existingIds.has(m.id))
        return [...prev, ...uniqueNewMeals]
      })

      // Fetch recipes for new meals
      const newRecipeIds = Array.from(new Set(newMeals.map((m) => m.recipe_id)))
      if (newRecipeIds.length > 0) {
        const recipes = await db.fetchRecipesByIds(newRecipeIds)
        setRecipesById((prev) => {
          const updated = { ...prev }
          recipes.forEach((r) => {
            updated[r.id] = r
          })
          return updated
        })
      }
    } catch (error) {
      console.error("[Meal Planner Hook] Error loading meal plan:", error)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [userId, dates])

  const addToMealPlan = useCallback(
    async (recipe: Recipe, mealType: string, date: string) => {
      if (!userId) return

      try {
        const result = await db.addMealToSchedule(userId, recipe.id, date, mealType as "breakfast" | "lunch" | "dinner")

        if (result) {
          // Update local state optimistically
          setRecipesById((prev) => ({ ...prev, [recipe.id]: recipe }))
          setMeals((prev) => [...prev, result])
        }
      } catch (error) {
        console.error("[Meal Planner Hook] Error adding meal:", error)
        throw error
      }
    },
    [userId]
  )

  const removeFromMealPlan = useCallback(
    async (mealType: string, date: string) => {
      if (!userId) return

      try {
        const success = await db.removeMealSlot(userId, date, mealType as "breakfast" | "lunch" | "dinner")

        if (success) {
          // Update local state optimistically
          setMeals((prev) => prev.filter((m) => !(m.date === date && m.meal_type === mealType)))
        }
      } catch (error) {
        console.error("[Meal Planner Hook] Error removing meal:", error)
        throw error
      }
    },
    [userId]
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
