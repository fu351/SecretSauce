"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
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
  wasDismissed: boolean
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
        description: "Your home base for recipes, planning, and shopping shortcuts.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Jump into any section from the cards",
          "The logo always returns you here",
          "Your saved recipes and alerts live below",
        ],
      },
      {
        id: 2,
        title: "Filter recipes fast",
        description: "Use the filter panel to narrow by difficulty, cuisine, and cook time.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        action: "highlight",
        tips: [
          "Try 'Beginner' + <30 minutes to start",
          "Combine filters for precise results",
          "Clear filters anytime to see everything",
        ],
      },
      {
        id: 3,
        title: "Open a recipe",
        description: "Use any recipe card to see ingredients, timing, and the save (heart) button.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        action: "highlight",
        tips: [
          "Tap the heart to save favorites",
          "Scan ingredients before you cook",
          "Scroll for nutrition and reviews",
        ],
      },
      {
        id: 4,
        title: "Plan your week",
        description: "Click the highlighted button to add recipes to your weekly meal plan. Perfect for organizing your cooking schedule.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        action: "highlight",
        tips: [
          "Save quick meals for busy nights",
          "Plan with shared ingredients to reduce waste",
          "Drag and drop to rearrange",
        ],
      },
      {
        id: 5,
        title: "Compare prices",
        description: "Your shopping list shows prices across stores so you can pick the cheapest trip.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        action: "highlight",
        tips: [
          "Each store shows its price per item",
          "Check off items as you shop",
          "Adjust quantities for items you already have",
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
        title: "Track your savings",
        description: "See spending trends and budget alerts on your dashboard.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "Weekly spending shows at a glance",
          "Set budget goals in settings",
          "Price alerts appear in cards",
        ],
      },
      {
        id: 2,
        title: "Add items to compare",
        description: "Use the highlighted button to add grocery items. We'll find prices across stores for you.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-add-item']",
        action: "highlight",
        tips: [
          "Start with your weekly staples like milk, eggs, bread",
          "Add proteins and produce you buy regularly",
          "More items = better comparisons",
        ],
      },
      {
        id: 3,
        title: "See the cheapest store",
        description: "The comparison table shows where each item is cheapest. Pick your store(s) and save.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='price-comparison']",
        action: "highlight",
        tips: [
          "Compare unit prices to spot savings",
          "Choose one or two stores to minimize trips",
          "Bulk wins if you'll use it",
        ],
      },
      {
        id: 4,
        title: "Find budget recipes",
        description: "Use the recipe filter (highlighted) to find meals that use your priced ingredients and fit your budget.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        action: "highlight",
        tips: [
          "Look for recipes with common pantry staples",
          "Plan multiple meals using sale ingredients",
          "Quick recipes save on energy costs too",
        ],
      },
      {
        id: 5,
        title: "Plan to save",
        description: "Add recipes to your meal plan (highlighted button) to avoid impulse purchases and reduce food waste.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        action: "highlight",
        tips: [
          "Choose recipes that share ingredients",
          "Cook larger batches to save time and money",
          "Adjust your plan based on what's in your fridge",
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
        title: "Health at a glance",
        description: "Your dashboard shows upcoming meals and nutrition insights to help you stay on track with your health goals.",
        page: "/dashboard",
        action: "highlight",
        tips: [
          "View your planned meals for the week",
          "Track nutrition trends over time",
          "Update dietary preferences in settings anytime",
        ],
      },
      {
        id: 2,
        title: "Build balanced meal plans",
        description: "Use the highlighted button to add nutritious recipes to your weekly schedule. Balance quick meals and healthier options.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        action: "highlight",
        tips: [
          "Include protein, vegetables, and whole grains each day",
          "Keep one night flexible for leftovers or eating out",
          "Prep ingredients ahead of time for busy weeknights",
        ],
      },
      {
        id: 3,
        title: "Find healthy recipes",
        description: "Use the filter panel to search by cook time, cuisine, and dietary preferences.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        action: "highlight",
        tips: [
          "Slide the cook time filter to find quick 30-minute meals",
          "Filter by dietary needs like 'High Protein' or 'Low Sodium'",
          "Save your favorite healthy recipes for easy access",
        ],
      },
      {
        id: 4,
        title: "Shop for freshness",
        description: "The shopping list (highlighted) organizes ingredients by store. Choose stores with the freshest produce.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        action: "highlight",
        tips: [
          "Pick stores known for quality fresh produce",
          "Check off items as you add them to your cart",
          "Swap processed ingredients for fresh alternatives",
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
  const [wasDismissed, setWasDismissed] = useState(false)
  const router = useRouter()
  const { user, profile } = useAuth()
  const DISMISS_KEY = "tutorial_dismissed_v1"

  const currentPath = currentPathId ? tutorialPaths[currentPathId] : null
  const currentStep = currentPath ? currentPath.steps[currentStepIndex] : null

  // Load dismissed state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(DISMISS_KEY)
    setWasDismissed(stored === "1")
  }, [])

  // Check if tutorial should be shown
  useEffect(() => {
    if (!user || !profile) {
      console.log('[Tutorial] Waiting for user/profile', { hasUser: !!user, hasProfile: !!profile })
      return
    }

    console.log('[Tutorial] Checking tutorial state', {
      tutorialCompleted: profile.tutorial_completed,
      primaryGoal: profile.primary_goal,
      isActive,
      isCompleted,
      wasDismissed,
    })

    // If user has completed the tutorial, avoid auto-starting but allow manual rewatch
    if (profile.tutorial_completed === true && !isActive) {
      console.log('[Tutorial] Tutorial already completed, not auto-starting')
      setIsActive(false)
      return
    }

    // If user has a primary goal and hasn't completed tutorial, auto-start (unless dismissed)
    if (profile.primary_goal && !isActive && !isCompleted && !wasDismissed) {
      const pathMap: Record<string, "cooking" | "budgeting" | "health"> = {
        cooking: "cooking",
        budgeting: "budgeting",
        both: "health",
      }
      const pathId = pathMap[profile.primary_goal]
      if (pathId) {
        console.log('[Tutorial] Auto-starting tutorial:', pathId)
        startTutorial(pathId)
      }
    }
  }, [user, profile, isActive, isCompleted, wasDismissed])

  const startTutorial = useCallback((pathId: "cooking" | "budgeting" | "health") => {
    console.log('[Tutorial] startTutorial called with pathId:', pathId)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
    setCurrentPathId(pathId)
    setCurrentStepIndex(0)
    setIsActive(true)
    setIsCompleted(false)
    console.log('[Tutorial] Tutorial started - isActive should now be true')
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
      setIsActive(false)
      setIsCompleted(false)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DISMISS_KEY, "1")
        setWasDismissed(true)
      }
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
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
    wasDismissed,
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
