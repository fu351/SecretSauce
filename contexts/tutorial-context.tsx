"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "./auth-context"

export interface TutorialSubstep {
  id: number
  instruction: string
  highlightSelector?: string // Element to highlight for this substep
  action?: "explore" | "click" | "navigate" | "highlight"
  actionTarget?: string
}

export interface TutorialStep {
  id: number
  title: string
  description: string
  tips?: string[]
  page: string // URL path like /recipes, /meal-planner
  highlightSelector?: string // CSS selector to highlight
  action?: "navigate" | "click" | "highlight"
  actionTarget?: string // Element to click or URL to navigate to
  nextButtonText?: string
  estimatedSeconds?: number
  substeps?: TutorialSubstep[] // Detailed steps to guide through this main step
}

export interface TutorialPath {
  id: "cooking" | "budgeting" | "health"
  name: string
  description: string
  steps: TutorialStep[]
}

interface TutorialContextType {
  isActive: boolean
  currentPath: TutorialPath | null
  currentStepIndex: number
  currentStep: TutorialStep | null
  isCompleted: boolean
  startTutorial: (pathId: "cooking" | "budgeting" | "health") => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (stepIndex: number) => void
  skipTutorial: () => void
  completeTutorial: () => void
  resetTutorial: () => void
  setRedirectAfterComplete: (path: string | null) => void
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined)

export function useTutorial() {
  const context = useContext(TutorialContext)
  if (context === undefined) {
    throw new Error("useTutorial must be used within a TutorialProvider")
  }
  return context
}

const tutorialPaths: Record<string, TutorialPath> = {
  cooking: {
    id: "cooking",
    name: "Mastering the Craft",
    description: "Learn to cook with confidence",
    steps: [
      {
        id: 1,
        title: "Your dashboard",
        description: "Your home base for recipes, meals, and shopping.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Quick links to Recipes, Meal Planner, and Shopping",
          "Cards show alerts and saved items",
          "Logo returns you here anytime",
        ],
      },
      {
        id: 2,
        title: "Filter recipes",
        description: "Find recipes by difficulty, cuisine, and cook time.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        action: "highlight",
        tips: [
          "Combine filters for better results",
          "Beginner recipes are easier to start with",
          "Turn off filters to see everything",
        ],
      },
      {
        id: 3,
        title: "Open a recipe",
        description: "Click any recipe to see ingredients, steps, nutrition, and prices.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        action: "highlight",
        tips: [
          "Check ingredients before you start",
          "Read all steps first",
          "Scroll to see nutrition and reviews",
        ],
      },
      {
        id: 4,
        title: "Save and rate",
        description: "Heart recipes you like and rate them to help the community.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        action: "highlight",
        tips: [
          "Save recipes you want to cook",
          "Reviews help you remember what worked",
          "Ratings help others find great recipes",
        ],
      },
      {
        id: 5,
        title: "Plan your week",
        description: "Add recipes to the weekly calendar to plan your dinners.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        action: "highlight",
        tips: [
          "Busy nights need quick meals",
          "Reuse ingredients across recipes to save",
          "Drag meals to swap them around",
        ],
      },
      {
        id: 6,
        title: "Shopping list",
        description: "Compare prices across stores and build your shopping list.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        action: "highlight",
        tips: [
          "See where each item costs less",
          "Check off items like a cart",
          "Adjust quantities if you own something",
        ],
      },
      {
        id: 7,
        title: "Ready to cook!",
        description: "You've learned to find recipes, plan meals, and compare prices.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Prep ingredients before starting",
          "Swap meals anytime in the planner",
          "Share your own recipes when you cook",
        ],
      },
    ],
  },
  budgeting: {
    id: "budgeting",
    name: "Optimize Resources",
    description: "Save money on groceries",
    steps: [
      {
        id: 1,
        title: "Savings snapshot",
        description: "Dashboard cards show your spending and alerts.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Track weekly spending trends",
          "Set budget goals in settings",
          "Check alerts for sales and deals",
        ],
      },
      {
        id: 2,
        title: "Add shopping items",
        description: "Add staples you buy every week so we can compare prices.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-add-item']",
        action: "highlight",
        tips: [
          "Start with proteins and produce",
          "Add sale items to compare deals",
          "Keep it focused for faster comparisons",
        ],
      },
      {
        id: 3,
        title: "Compare stores",
        description: "See which store has the cheapest prices for your items.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='price-comparison']",
        action: "highlight",
        tips: [
          "Check unit prices for hidden markups",
          "Pick one main store to reduce trips",
          "Bulk items save money if you use them",
        ],
      },
      {
        id: 4,
        title: "Budget-friendly recipes",
        description: "Find recipes that use the ingredients you just priced.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        action: "highlight",
        tips: [
          "Filter for recipes with pantry staples",
          "Reuse sale ingredients in multiple recipes",
          "Quick meals save on energy costs",
        ],
      },
      {
        id: 5,
        title: "Plan meals",
        description: "Plan meals to avoid buying extras you don't need.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        action: "highlight",
        tips: [
          "Use recipes that share ingredients",
          "Cook once, eat twice with batch cooking",
          "Move meals around based on leftovers",
        ],
      },
      {
        id: 6,
        title: "Keep saving!",
        description: "You can now build lists, compare stores, and plan meals to save money.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Check prices once a week",
          "Freeze extras to prevent waste",
          "Update your list as you run low",
        ],
      },
    ],
  },
  health: {
    id: "health",
    name: "Elevate Your Journey",
    description: "Save time and prioritize health",
    steps: [
      {
        id: 1,
        title: "Your healthy routine",
        description: "Plan healthy meals, cook on time, and shop smartly.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Check upcoming meals and health reminders",
          "Review your nutrition trends",
          "Set dietary preferences in settings",
        ],
      },
      {
        id: 2,
        title: "Plan balanced meals",
        description: "Spread wholesome recipes across busy and calm days.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        action: "highlight",
        tips: [
          "Mix proteins, veggies, and whole grains through the week",
          "Leave one flexible night for leftovers",
          "Prep ingredients the night before busy days",
        ],
      },
      {
        id: 3,
        title: "Filter healthy recipes",
        description: "Filter for quick cook times, preferred cuisines, or dietary needs.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        action: "highlight",
        tips: [
          "Use the Cooking Time slider to find meals under 30 minutes",
          "Search for terms like high protein or low sodium",
          "Save the healthiest recipes to your favorites",
        ],
      },
      {
        id: 4,
        title: "Check nutrition",
        description: "Every recipe lists calories, macros, and key nutrients.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='nutrition-info']",
        action: "highlight",
        tips: [
          "Watch sodium and sugar if you track heart health",
          "Aim for protein at every meal to stay full",
          "Use the serving slider to scale portions",
        ],
      },
      {
        id: 5,
        title: "Shop smart",
        description: "Your shopping list groups ingredients by store for fresh options.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        action: "highlight",
        tips: [
          "Choose the store with the best produce for the week",
          "Check off items as you prep them to stay organized",
          "Replace processed items with fresh alternatives",
        ],
      },
      {
        id: 6,
        title: "All set!",
        description: "You know how to plan, filter, review nutrition, and shop without guesswork.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Batch cook grains or proteins for grab-and-go meals",
          "Log how each meal makes you feel",
          "Come back weekly to refresh your plan",
        ],
      },
    ],
  },
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [currentPathId, setCurrentPathId] = useState<"cooking" | "budgeting" | "health" | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [redirectAfterComplete, setRedirectAfterComplete] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile } = useAuth()

  const currentPath = currentPathId ? tutorialPaths[currentPathId] : null
  const currentStep = currentPath ? currentPath.steps[currentStepIndex] : null

  // Check if tutorial should be shown
  useEffect(() => {
    if (!user || !profile) return

    // If user has completed tutorial, don't show it
    if (profile.tutorial_completed) {
      setIsActive(false)
      return
    }

    // If user has a primary goal and hasn't completed tutorial, auto-start
    if (profile.primary_goal && !isActive && !isCompleted) {
      const pathMap: Record<string, "cooking" | "budgeting" | "health"> = {
        cooking: "cooking",
        budgeting: "budgeting",
        both: "health",
      }
      const pathId = pathMap[profile.primary_goal]
      if (pathId) {
        startTutorial(pathId)
      }
    }
  }, [user, profile])

  // Auto-navigate to tutorial page when step changes
  useEffect(() => {
    if (currentStep && pathname !== currentStep.page && isActive) {
      router.push(currentStep.page)
    }
  }, [currentStep, pathname, isActive, router])

  const startTutorial = useCallback((pathId: "cooking" | "budgeting" | "health") => {
    setCurrentPathId(pathId)
    setCurrentStepIndex(0)
    setIsActive(true)
    setIsCompleted(false)
  }, [])

  const nextStep = useCallback(() => {
    if (currentPath && currentStepIndex < currentPath.steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      completeTutorial()
    }
  }, [currentPath, currentStepIndex])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }, [currentStepIndex])

  const goToStep = useCallback((stepIndex: number) => {
    if (currentPath && stepIndex >= 0 && stepIndex < currentPath.steps.length) {
      setCurrentStepIndex(stepIndex)
    }
  }, [currentPath])

  const skipTutorial = useCallback(async () => {
    if (!user) return
    try {
      await supabase.from("profiles").update({ tutorial_completed: true }).eq("id", user.id)
      setIsActive(false)
      setIsCompleted(true)
    } catch (error) {
      console.error("Error skipping tutorial:", error)
    }
  }, [user])

  const completeTutorial = useCallback(async () => {
    if (!user || !currentPathId) return
    try {
      await supabase.from("profiles").update({
        tutorial_completed: true,
        tutorial_completed_at: new Date().toISOString(),
        tutorial_path: currentPathId,
      }).eq("id", user.id)
      setIsActive(false)
      setIsCompleted(true)

      // Redirect to specified path after completion, or dashboard by default
      if (redirectAfterComplete) {
        router.push(redirectAfterComplete)
      }
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, currentPathId, redirectAfterComplete, router])

  const resetTutorial = useCallback(() => {
    setIsActive(true)
    setCurrentStepIndex(0)
    setIsCompleted(false)
  }, [])

  const value: TutorialContextType = {
    isActive,
    currentPath,
    currentStepIndex,
    currentStep,
    isCompleted,
    startTutorial,
    nextStep,
    prevStep,
    goToStep,
    skipTutorial,
    completeTutorial,
    resetTutorial,
    setRedirectAfterComplete,
  }

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}
