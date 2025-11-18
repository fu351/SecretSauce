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
          "Your dashboard shows reminders, saved recipes, and shopping alerts. We’ll use it as your home base. When you’re ready, tap Next and we’ll jump you to each page automatically.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Show me around",
        estimatedSeconds: 20,
        tips: [
          "Use the quick links to jump to Recipes, Meal Planner, or Shopping",
          "Watch the notice cards for new reviews or price drops",
          "Click the logo anytime to return here",
        ],
        substeps: [
          {
            id: 1,
            instruction: "Scan the dashboard cards so you know where to find reminders, favorites, and shopping alerts.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "When you're ready to keep going, press Next and we'll open the Recipes page for you.",
            action: "highlight",
          },
        ],
      },
      {
        id: 2,
        title: "Use recipe filters",
        description: "Filters make it simple to find meals that match your skill, time, and cravings.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Combine difficulty, cuisine, and cook time for laser-focused results",
          "Beginner recipes have the gentlest steps",
          "Switch filters off to see the full catalog again",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse recipes",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Find the filter panel on the left. It has Difficulty, Cuisine, and Cooking Time controls.",
            highlightSelector: "[data-tutorial='recipe-filter']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click the Beginner option so the list only shows easy recipes.",
            highlightSelector: "[data-tutorial='recipe-filter']",
            action: "click",
            actionTarget: "[data-tutorial='recipe-filter']",
          },
          {
            id: 3,
            instruction: "Add one more filter (Cuisine or Cooking Time) to narrow the results even more.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Open a recipe card",
        description: "Click any recipe card to read the ingredients, instructions, nutrition facts, reviews, and price estimate.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Scan the ingredient list before cooking",
          "Read every step once before you touch a pan",
          "Scroll to see nutrition info and reviews",
        ],
        action: "click",
        nextButtonText: "Keep going",
        estimatedSeconds: 40,
      },
      {
        id: 4,
        title: "Save favorites and leave feedback",
        description: "Favorites and ratings personalize your feed and help other cooks.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Favorite the recipes you plan to cook soon",
          "A short review helps you remember tweaks later",
          "Ratings push great dishes to the top for everyone",
        ],
        action: "highlight",
        nextButtonText: "Next step",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Tap the heart icon on a recipe you like to save it to Favorites.",
            action: "click",
          },
          {
            id: 2,
            instruction: "Scroll to the Reviews section and click “Write a review” or pick a star rating.",
            action: "click",
          },
          {
            id: 3,
            instruction: "Type any notes you want to remember, then submit the review.",
            action: "explore",
          },
        ],
      },
      {
        id: 5,
        title: "Plan your week",
        description: "Solve dinner decisions ahead of time by dropping recipes into the Meal Planner calendar.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Fill busy nights with quicker meals",
          "Match recipes that reuse the same ingredients",
          "Move meals around anytime by dragging them",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Open Meal Planner",
        estimatedSeconds: 60,
        substeps: [
          {
            id: 1,
            instruction: "Look at the weekly calendar grid so you know which nights are still empty.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Click the “Add Recipe” button on a day to pick a meal for that slot.",
            highlightSelector: "[data-tutorial='meal-plan-add']",
            action: "click",
            actionTarget: "[data-tutorial='meal-plan-add']",
          },
          {
            id: 3,
            instruction: "Repeat until at least two days show a planned recipe.",
            action: "explore",
          },
          {
            id: 4,
            instruction: "Drag a recipe card to a different day if your plans change.",
            action: "explore",
          },
        ],
      },
      {
        id: 6,
        title: "Generate your shopping list",
        description: "Everything in your planner flows into Shopping so you can check prices and stock up quickly.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "Each ingredient shows where it’s cheapest",
          "Use the checkboxes like a digital cart",
          "Adjust quantities when you already own something",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go shopping",
        estimatedSeconds: 50,
        substeps: [
          {
            id: 1,
            instruction: "Find the Shopping List panel filled with the ingredients from your meal plan.",
            highlightSelector: "[data-tutorial='shopping-list']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click the store tabs or comparison view to see where each item costs less.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Check off items as you add them to your cart or pantry.",
            action: "explore",
          },
        ],
      },
      {
        id: 7,
        title: "You’re ready to cook",
        description: "You know how to find recipes, plan, shop, and share feedback. Time to cook.",
        page: "/dashboard",
        tips: [
          "Prep ingredients before you start the stove",
          "Return to the planner anytime to swap meals",
          "Upload your own recipes when you’re proud of them",
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
        title: "See today’s savings snapshot",
        description:
          "The dashboard tiles show spending trends and alerts so you always know where your budget stands. Press Next whenever you’re ready and we’ll walk you through each page.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let’s save",
        estimatedSeconds: 15,
        substeps: [
          {
            id: 1,
            instruction: "Review the savings cards so you know your current spend and any alerts.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "When you want to move on, press Next and we'll navigate to your Shopping tools automatically.",
            action: "highlight",
          },
        ],
      },
      {
        id: 2,
        title: "Add items to your shopping list",
        description: "We’ll pull prices for every item you add, so start with the staples you buy every week.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-add-item']",
        tips: [
          "Think about proteins, produce, and pantry basics",
          "Add sale items even if you’re unsure—they’re easy to remove",
          "Keep the list short and focused for faster comparisons",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Open Shopping",
        estimatedSeconds: 50,
        substeps: [
          {
            id: 1,
            instruction: "Click the “Add Item” button.",
            highlightSelector: "[data-tutorial='shopping-add-item']",
            action: "click",
            actionTarget: "[data-tutorial='shopping-add-item']",
          },
          {
            id: 2,
            instruction: "Type the name of an item you need this week and press enter.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Repeat for two or three more essentials.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Compare stores side by side",
        description: "The price comparison table shows which store keeps your cart cheapest.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='price-comparison']",
        tips: [
          "Look at unit prices to spot sneaky markups",
          "Pick one primary store to reduce trips",
          "Bulk items cost less when you plan to use them",
        ],
        action: "highlight",
        nextButtonText: "Keep comparing",
        estimatedSeconds: 40,
        substeps: [
          {
            id: 1,
            instruction: "Study the price comparison chart. Each column is a store and each row is one of your items.",
            highlightSelector: "[data-tutorial='price-comparison']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click the store names to sort or focus on a single retailer.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Choose the store that gives you the lowest total for your list.",
            action: "explore",
          },
        ],
      },
      {
        id: 4,
        title: "Pick budget-friendly recipes",
        description: "Head to Recipes and use filters to find meals that match the ingredients you just priced.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Filter for recipes that rely on pantry staples",
          "Use the search bar to reuse sale ingredients",
          "Shorter cook times usually mean lower energy costs",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Find recipes",
        estimatedSeconds: 50,
      },
      {
        id: 5,
        title: "Drop recipes into the weekly plan",
        description: "Planning a week of meals keeps you from buying extras you don’t need.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Stack recipes that share the same vegetables or grains",
          "Batch cook once and eat twice",
          "Move meals forward if leftovers are piling up",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Plan meals",
        estimatedSeconds: 55,
      },
      {
        id: 6,
        title: "Keep the savings rolling",
        description: "You can now build lists, compare stores, pick the right recipes, and plan ahead. That’s the whole cycle.",
        page: "/dashboard",
        tips: [
          "Check the price comparison once a week",
          "Freeze extras so nothing goes to waste",
          "Update the shopping list whenever you run low",
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
          "We’ll help you plan nourishing meals, cook on time, and shop smarter. Tap Next below and we’ll take you to each step in order.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let’s begin",
        estimatedSeconds: 15,
        substeps: [
          {
            id: 1,
            instruction: "Glance at the dashboard tiles to see upcoming meals and any health-focused reminders.",
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
