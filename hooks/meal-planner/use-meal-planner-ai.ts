"use client"

import { useState, useCallback } from "react"
import { useMealPlannerDB, type MealScheduleRow } from "@/lib/database/meal-planner-db"
import type { Recipe } from "@/lib/types"
import { useToast } from "@/hooks/ui/use-toast"

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

export function useMealPlannerAi(userId: string | undefined, weekDates: string[], meals: MealScheduleRow[]) {
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
    async () => {
      if (!aiPlanResult || !userId) return

      try {
        // Remove existing dinners for this week
        for (const date of weekDates) {
          await db.removeMealSlot(userId, date, "dinner")
        }

        // Add new dinners from AI plan
        for (const dinner of aiPlanResult.dinners) {
          const date = weekDates[dinner.dayIndex]
          if (date) {
            await db.addMealToSchedule(userId, dinner.recipeId, date, "dinner")
          }
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
    [aiPlanResult, userId, weekDates, db, toast]
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
