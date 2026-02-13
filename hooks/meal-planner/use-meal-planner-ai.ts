"use client"

import { useState, useCallback } from "react"
import { mealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe, MealTypeTag } from "@/lib/types"
import { getDatesForWeek } from "@/lib/date-utils"
import { useToast } from "@/hooks/ui/use-toast"
import { useHeuristicPlan } from "@/hooks/meal-planner/use-heuristic-plan"

interface AiPlanResult {
  storeId: string
  totalCost: number
  meals: Array<{ dayIndex: number; mealType: MealTypeTag; recipeId: string }>
  explanation: string
}

interface AiProgress {
  step: number
  message: string
}

export function useMealPlannerAi(userId: string | undefined, weekIndex: number) {
  const { toast } = useToast()
  const [aiPlannerLoading, setAiPlannerLoading] = useState(false)
  const [aiPlannerProgress, setAiPlannerProgress] = useState<AiProgress>({ step: 0, message: "" })
  const [aiPlanResult, setAiPlanResult] = useState<AiPlanResult | null>(null)
  const [showAiPlanDialog, setShowAiPlanDialog] = useState(false)
  const [aiRecipesById, setAiRecipesById] = useState<Record<string, Recipe>>({})

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
      // Simulate progress updates
      const progressTimer = setTimeout(() => {
        setAiPlannerProgress({ step: 2, message: "Searching recipes that match your taste..." })
      }, 1500)

      const progressTimer2 = setTimeout(() => {
        setAiPlannerProgress({ step: 3, message: "Comparing prices across stores..." })
      }, 4000)

      const progressTimer3 = setTimeout(() => {
        setAiPlannerProgress({ step: 4, message: "Optimizing for variety and budget..." })
      }, 7000)

      // Clear progress timers
      clearTimeout(progressTimer)
      clearTimeout(progressTimer2)
      clearTimeout(progressTimer3)

      setAiPlannerProgress({ step: 5, message: "Finalizing your meal plan..." })

      // Use heuristic plan instead of AI API
      const plan = await useHeuristicPlan(userId, weekIndex)

      // Fetch recipe details for the plan
      if (plan.meals && plan.meals.length > 0) {
        const recipeIds = [...new Set(plan.meals.map((m: any) => m.recipeId))]
        const recipes = await mealPlannerDB.fetchRecipesByIds(recipeIds)

        if (recipes) {
          const newRecipes: Record<string, Recipe> = {}
          recipes.forEach((recipe: Recipe) => {
            newRecipes[recipe.id] = recipe
          })
          setAiRecipesById(newRecipes)
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
  }, [userId, toast, mealPlannerDB])

  const applyAiPlanToMealPlanner = useCallback(
    async () => {
      if (!aiPlanResult || !userId) return
      const weekDates = getDatesForWeek(weekIndex).map(d => d.toISOString().split("T")[0])

      try {
        // Add all meals from AI plan (the plan already skipped existing slots)
        for (const meal of aiPlanResult.meals) {
          const date = weekDates[meal.dayIndex]
          if (date) {
            await mealPlannerDB.addMealToSchedule(userId, meal.recipeId, date, meal.mealType)
          }
        }

        setShowAiPlanDialog(false)

        const mealCount = aiPlanResult.meals.length
        toast({
          title: "Success",
          description: `${mealCount} meal${mealCount !== 1 ? 's' : ''} added! Estimated cost: $${aiPlanResult.totalCost.toFixed(2)} at ${aiPlanResult.storeId}`,
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
    [aiPlanResult, userId, weekIndex, mealPlannerDB, toast]
  )

  return {
    aiPlannerLoading,
    aiPlannerProgress,
    aiPlanResult,
    showAiPlanDialog,
    setShowAiPlanDialog,
    generateAiWeeklyPlan,
    applyAiPlanToMealPlanner,
    aiRecipesById,
  }
}
