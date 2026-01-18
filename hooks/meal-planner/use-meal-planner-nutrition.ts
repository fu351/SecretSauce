"use client"

import { useMemo } from "react"
import { type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"

type NutritionTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  meals: number
}

type MacroKey = "calories" | "protein" | "carbs" | "fat"

const createEmptyNutritionTotals = (): NutritionTotals => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  meals: 0,
})

export function useMealPlannerNutrition(
  meals: MealScheduleRow[],
  weekDates: string[],
  recipesById: Record<string, Recipe>
) {
  const dailyNutritionTotals = useMemo(() => {
    if (!weekDates.length) return {} as Record<string, NutritionTotals>
    const totals: Record<string, NutritionTotals> = {}
    weekDates.forEach((date) => {
      totals[date] = { ...createEmptyNutritionTotals() }
    })

    const weekSet = new Set(weekDates)
    meals.forEach((meal) => {
      if (!weekSet.has(meal.date)) return
      const recipe = recipesById[meal.recipe_id]
      if (!recipe?.nutrition) return
      const dayTotals = totals[meal.date] ?? (totals[meal.date] = { ...createEmptyNutritionTotals() })
      dayTotals.calories += recipe.nutrition.calories || 0
      dayTotals.protein += recipe.nutrition.protein || 0
      dayTotals.carbs += recipe.nutrition.carbs || 0
      dayTotals.fat += recipe.nutrition.fat || 0
      dayTotals.meals += 1
    })

    return totals
  }, [meals, weekDates, recipesById])

  const weeklyNutritionSummary = useMemo<{
    totals: Record<MacroKey, number>
    averages: Record<MacroKey, number>
  }>(() => {
    const totals: Record<MacroKey, number> = { calories: 0, protein: 0, carbs: 0, fat: 0 }
    weekDates.forEach((date) => {
      const dayTotals = dailyNutritionTotals[date]
      if (!dayTotals) return
      totals.calories += dayTotals.calories
      totals.protein += dayTotals.protein
      totals.carbs += dayTotals.carbs
      totals.fat += dayTotals.fat
    })
    const divisor = weekDates.length || 1
    const averages: Record<MacroKey, number> = {
      calories: totals.calories / divisor,
      protein: totals.protein / divisor,
      carbs: totals.carbs / divisor,
      fat: totals.fat / divisor,
    }
    return { totals, averages }
  }, [dailyNutritionTotals, weekDates])

  return {
    dailyNutritionTotals,
    weeklyNutritionSummary,
  }
}
