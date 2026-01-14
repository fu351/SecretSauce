"use client"

import { useState, useCallback } from "react"
import { useMealPlannerDB } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"
import { useToast } from "@/hooks/ui/use-toast"

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

interface AiPlanResult {
  storeId: string
  totalCost: number
  dinners: Array<{ dayIndex: number; recipeId: string }>
  explanation: string
}

interface AiProgress {
  step: number
  message: string
}

export function useMealPlannerAi(userId: string | undefined, weekDates: string[], mealPlan: MealPlan | null) {
  const db = useMealPlannerDB()
  const { toast } = useToast()
  const [aiPlannerLoading, setAiPlannerLoading] = useState(false)
  const [aiPlannerProgress, setAiPlannerProgress] = useState<AiProgress>({ step: 0, message: "" })
  const [aiPlanResult, setAiPlanResult] = useState<AiPlanResult | null>(null)
  const [showAiPlanDialog, setShowAiPlanDialog] = useState(false)

  const generateAiWeeklyPlan = useCallback(async (recipesById: Record<string, Recipe>) => {
    if (!userId) {
      toast({
        title: "Error",
        description: "Please sign in to use the AI planner",
        variant: "destructive",
      })
      return
    }

    // Show dialog immediately with loading state
    setAiPlanResult(null)
    setAiPlannerLoading(true)
    setAiPlannerProgress({ step: 1, message: "Analyzing your preferences and pantry..." })
    setShowAiPlanDialog(true)

    try {
      // Simulate progress updates (the API doesn't stream, so we estimate timing)
      const progressTimer = setTimeout(() => {
        setAiPlannerProgress({ step: 2, message: "Searching recipes that match your taste..." })
      }, 1500)

      const progressTimer2 = setTimeout(() => {
        setAiPlannerProgress({ step: 3, message: "Comparing prices across stores..." })
      }, 4000)

      const progressTimer3 = setTimeout(() => {
        setAiPlannerProgress({ step: 4, message: "Optimizing for variety and budget..." })
      }, 7000)

      const response = await fetch("/api/weekly-dinner-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      // Clear progress timers
      clearTimeout(progressTimer)
      clearTimeout(progressTimer2)
      clearTimeout(progressTimer3)

      if (!response.ok) {
        throw new Error("Failed to generate plan")
      }

      setAiPlannerProgress({ step: 5, message: "Finalizing your meal plan..." })

      const plan = await response.json()

      // Fetch recipe details for the plan
      if (plan.dinners && plan.dinners.length > 0) {
        const recipeIds = plan.dinners.map((d: any) => d.recipeId)
        const recipes = await db.fetchRecipesByIds(recipeIds)

        if (recipes) {
          const newRecipesById = { ...recipesById }
          recipes.forEach((recipe: Recipe) => {
            newRecipesById[recipe.id] = recipe
          })
        }
      }

      setAiPlanResult(plan)
      setAiPlannerProgress({ step: 6, message: "Complete!" })
    } catch (error) {
      console.error("[AI Planner Hook] Error:", error)
      setShowAiPlanDialog(false)
      toast({
        title: "AI Planner Error",
        description: "Failed to generate weekly plan. Please try again.",
        variant: "destructive",
      })
    } finally {
      setAiPlannerLoading(false)
    }
  }, [userId, toast, db])

  const applyAiPlanToMealPlanner = useCallback(
    async (recipesById: Record<string, Recipe>) => {
      if (!aiPlanResult || !userId) return

      try {
        const newMeals: MealEntry[] = []

        for (const dinner of aiPlanResult.dinners) {
          const date = weekDates[dinner.dayIndex]
          if (date) {
            newMeals.push({
              meal_type: "dinner",
              date,
              recipe_id: dinner.recipeId,
            })
          }
        }

        const existingMeals = mealPlan?.meals || []
        const nonDinnerMeals = existingMeals.filter((m) => m.meal_type !== "dinner" || !weekDates.includes(m.date))
        const updatedMeals = [...nonDinnerMeals, ...newMeals]

        const planData = {
          user_id: userId,
          week_start: weekDates[0],
          meals: updatedMeals,
          shopping_list: mealPlan?.shopping_list || null,
          total_budget: mealPlan?.total_budget || null,
        }

        if (mealPlan?.id) {
          await db.updateMealPlan(mealPlan.id, updatedMeals)
        } else {
          await db.createMealPlan(userId, weekDates[0], updatedMeals)
        }

        setShowAiPlanDialog(false)

        toast({
          title: "Success",
          description: `7-day dinner plan applied! Estimated cost: $${aiPlanResult.totalCost.toFixed(2)} at ${aiPlanResult.storeId}`,
        })

        return true
      } catch (error) {
        console.error("[AI Planner Hook] Error applying plan:", error)
        toast({
          title: "Error",
          description: "Failed to apply AI plan. Please try again.",
          variant: "destructive",
        })
        return false
      }
    },
    [aiPlanResult, userId, weekDates, mealPlan, db, toast]
  )

  return {
    aiPlannerLoading,
    aiPlannerProgress,
    aiPlanResult,
    showAiPlanDialog,
    setShowAiPlanDialog,
    generateAiWeeklyPlan,
    applyAiPlanToMealPlanner,
  }
}
