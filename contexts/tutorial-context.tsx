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
        title: "Start from your dashboard",
        description:
          "Your home base for recipes, meals, and shopping. We'll tour the app from here.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Show me around",
        estimatedSeconds: 20,
        tips: [
          "Quick links to Recipes, Meal Planner, and Shopping",
          "Cards show alerts and saved items",
          "Logo returns you here anytime",
        ],
        substeps: [
          {
            id: 1,
            instruction: "Look at the dashboard cards to see what's here.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Ready? Press Next to move to the Recipes page.",
            action: "highlight",
          },
        ],
      },
      {
        id: 2,
        title: "Use recipe filters",
        description: "Find recipes by difficulty, cuisine, and cook time.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Combine filters for better results",
          "Beginner recipes are easier to start with",
          "Turn off filters to see everything",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse recipes",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "See the filter panel on the left with Difficulty, Cuisine, and Cook Time.",
            highlightSelector: "[data-tutorial='recipe-filter']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click Beginner to see easier recipes.",
            highlightSelector: "[data-tutorial='recipe-filter']",
            action: "click",
            actionTarget: "[data-tutorial='recipe-filter']",
          },
          {
            id: 3,
            instruction: "Add another filter to narrow results further.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Open a recipe card",
        description: "Click a recipe to see ingredients, steps, nutrition, and prices.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Check ingredients before you start",
          "Read all steps first",
          "Scroll to see nutrition and reviews",
        ],
        action: "click",
        nextButtonText: "Keep going",
        estimatedSeconds: 40,
      },
      {
        id: 4,
        title: "Save favorites and leave feedback",
        description: "Heart recipes you like and rate them to help the community.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Save recipes you want to cook",
          "Reviews help you remember what worked",
          "Ratings help others find great recipes",
        ],
        action: "highlight",
        nextButtonText: "Next step",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Click the heart icon to save a recipe.",
            action: "click",
          },
          {
            id: 2,
            instruction: "Scroll to Reviews and give a star rating or write a note.",
            action: "click",
          },
          {
            id: 3,
            instruction: "Add any tips you want to remember, then submit.",
            action: "explore",
          },
        ],
      },
      {
        id: 5,
        title: "Plan your week",
        description: "Add recipes to the weekly calendar to plan your dinners.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Busy nights need quick meals",
          "Reuse ingredients across recipes to save",
          "Drag meals to swap them around",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Open Meal Planner",
        estimatedSeconds: 60,
        substeps: [
          {
            id: 1,
            instruction: "See the weekly calendar with empty dinner slots.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Click Add Recipe on a day to pick a meal.",
            highlightSelector: "[data-tutorial='meal-plan-add']",
            action: "click",
            actionTarget: "[data-tutorial='meal-plan-add']",
          },
          {
            id: 3,
            instruction: "Add recipes to at least two days.",
            action: "explore",
          },
          {
            id: 4,
            instruction: "Drag a meal to a different day to rearrange.",
            action: "explore",
          },
        ],
      },
      {
        id: 6,
        title: "Generate your shopping list",
        description: "Compare prices across stores and build your shopping list.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "See where each item costs less",
          "Check off items like a cart",
          "Adjust quantities if you own something",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go shopping",
        estimatedSeconds: 50,
        substeps: [
          {
            id: 1,
            instruction: "See your shopping list with ingredients from your meal plan.",
            highlightSelector: "[data-tutorial='shopping-list']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click store tabs to compare prices for each item.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Check off items as you add them to your list.",
            action: "explore",
          },
        ],
      },
      {
        id: 7,
        title: "You're ready to cook",
        description: "You've learned to find recipes, plan meals, and compare prices.",
        page: "/dashboard",
        tips: [
          "Prep ingredients before starting",
          "Swap meals anytime in the planner",
          "Share your own recipes when you cook",
        ],
        action: "navigate",
        actionTarget: "/dashboard",
        nextButtonText: "Finish tutorial",
        estimatedSeconds: 15,
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
        title: "See today's savings snapshot",
        description:
          "Dashboard cards show your spending and alerts.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's save",
        estimatedSeconds: 15,
        substeps: [
          {
            id: 1,
            instruction: "Check the savings cards to see your current spend.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Ready? Press Next to go to Shopping.",
            action: "highlight",
          },
        ],
      },
      {
        id: 2,
        title: "Add items to your shopping list",
        description: "Add staples you buy every week so we can compare prices.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-add-item']",
        tips: [
          "Start with proteins and produce",
          "Add sale items to compare deals",
          "Keep it focused for faster comparisons",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Open Shopping",
        estimatedSeconds: 50,
        substeps: [
          {
            id: 1,
            instruction: "Click Add Item.",
            highlightSelector: "[data-tutorial='shopping-add-item']",
            action: "click",
            actionTarget: "[data-tutorial='shopping-add-item']",
          },
          {
            id: 2,
            instruction: "Type an item you need and press enter.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Add two or three more items.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Compare stores side by side",
        description: "See which store has the cheapest prices for your items.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='price-comparison']",
        tips: [
          "Check unit prices for hidden markups",
          "Pick one main store to reduce trips",
          "Bulk items save money if you use them",
        ],
        action: "highlight",
        nextButtonText: "Keep comparing",
        estimatedSeconds: 40,
        substeps: [
          {
            id: 1,
            instruction: "Look at the price comparison chart with stores and your items.",
            highlightSelector: "[data-tutorial='price-comparison']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click store names to sort or focus on one retailer.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Pick the store with the lowest total.",
            action: "explore",
          },
        ],
      },
      {
        id: 4,
        title: "Pick budget-friendly recipes",
        description: "Find recipes that use the ingredients you just priced.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Filter for recipes with pantry staples",
          "Reuse sale ingredients in multiple recipes",
          "Quick meals save on energy costs",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Find recipes",
        estimatedSeconds: 50,
      },
      {
        id: 5,
        title: "Drop recipes into the weekly plan",
        description: "Plan meals to avoid buying extras you don't need.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Use recipes that share ingredients",
          "Cook once, eat twice with batch cooking",
          "Move meals around based on leftovers",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Plan meals",
        estimatedSeconds: 55,
      },
      {
        id: 6,
        title: "Keep the savings rolling",
        description: "You can now build lists, compare stores, and plan meals to save money.",
        page: "/dashboard",
        tips: [
          "Check prices once a week",
          "Freeze extras to prevent waste",
          "Update your list as you run low",
        ],
        action: "navigate",
        actionTarget: "/dashboard",
        nextButtonText: "Finish tutorial",
        estimatedSeconds: 15,
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
        title: "Welcome to your healthy routine",
        description:
          "Plan healthy meals, cook on time, and shop smartly.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's begin",
        estimatedSeconds: 15,
        substeps: [
          {
            id: 1,
            instruction: "Check the dashboard tiles for upcoming meals and health reminders.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Press Next when you're ready and we'll move you to the Meal Planner automatically.",
            action: "highlight",
          },
        ],
      },
      {
        id: 2,
        title: "Plan a balanced week",
        description: "Use the Meal Planner to spread wholesome recipes across busy and calm days.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Mix proteins, veggies, and whole grains through the week",
          "Leave one flexible night for leftovers",
          "Prep ingredients the night before busy days",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Open planner",
        estimatedSeconds: 55,
        substeps: [
          {
            id: 1,
            instruction: "Scan the calendar so you know which days need the quickest meals.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Click “Add Recipe” and choose a healthy meal for that day.",
            highlightSelector: "[data-tutorial='meal-plan-add']",
            action: "click",
            actionTarget: "[data-tutorial='meal-plan-add']",
          },
          {
            id: 3,
            instruction: "Repeat until at least three days of the week are planned.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Filter for healthy recipes",
        description: "In Recipes, filter for quick cook times, preferred cuisines, or dietary needs like vegetarian or low carb.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Use the Cooking Time slider to find meals under 30 minutes",
          "Search for terms like “high protein” or “low sodium”",
          "Save the healthiest recipes to your favorites for fast reuse",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Show recipes",
        estimatedSeconds: 45,
      },
      {
        id: 4,
        title: "Read the nutrition panel",
        description: "Every recipe lists calories, macros, and key nutrients so you can stay on target.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='nutrition-info']",
        tips: [
          "Watch sodium and sugar if you track heart health",
          "Aim for protein at every meal to stay full",
          "Use the serving slider to scale portions",
        ],
        action: "highlight",
        nextButtonText: "Keep going",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Open a recipe and scroll to the Nutrition section.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Review calories, protein, carbs, fat, sodium, and sugar per serving.",
            highlightSelector: "[data-tutorial='nutrition-info']",
            action: "highlight",
          },
          {
            id: 3,
            instruction: "Decide if you need to adjust the portion size slider to match your goals.",
            action: "explore",
          },
        ],
      },
      {
        id: 5,
        title: "Shop with nutrition in mind",
        description: "Your shopping list groups ingredients by store so you can pick the freshest option every time.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "Choose the store with the best produce for the week",
          "Check off items as you prep them to stay organized",
          "Replace anything processed with a fresh alternative when possible",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Review list",
        estimatedSeconds: 45,
      },
      {
        id: 6,
        title: "Enjoy the routine",
        description: "You now know how to plan, filter, review nutrition, and shop without guesswork.",
        page: "/dashboard",
        tips: [
          "Batch cook grains or proteins for grab-and-go meals",
          "Log how each meal makes you feel so you can repeat the winners",
          "Come back weekly to refresh your plan",
        ],
        action: "navigate",
        actionTarget: "/dashboard",
        nextButtonText: "Finish tutorial",
        estimatedSeconds: 15,
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
