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
        title: "Your Cooking Journey Starts Here",
        description: "Welcome to a community of home cooks sharing easy recipes, clean instructions, and proven techniques. Let's find recipes that match your skill level.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's Start",
        estimatedSeconds: 20,
        tips: [
          "Browse recipes from beginner to advanced",
          "Read what other cooks think with ratings and reviews",
          "Upload your own recipes when you're ready to share",
        ],
      },
      {
        id: 2,
        title: "Guided Recipe Discovery",
        description: "Filters are your friend. Find recipes by difficulty (Beginner, Intermediate, Advanced), cooking time, and cuisine. Let's start with what matters most.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Filter by difficulty level to build confidence progressively",
          "Search by cuisine to explore different styles",
          "Check prep and cook times to fit your schedule",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse Recipes",
        estimatedSeconds: 60,
        substeps: [
          {
            id: 1,
            instruction: "Look at the filter panel on the left side. You'll see options for difficulty level, cuisine type, and cooking time.",
            highlightSelector: "[data-tutorial='recipe-filter']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click on 'Beginner' difficulty to filter for recipes that are easy to start with.",
            highlightSelector: "[data-tutorial='recipe-filter']",
            action: "click",
            actionTarget: "[data-tutorial='recipe-filter']",
          },
          {
            id: 3,
            instruction: "Browse the recipes that appear. Notice how the difficulty filter has narrowed down the results to beginner-friendly options.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Understanding Your Recipe Page",
        description: "Click any recipe to see everything you need: clear instructions, ingredient list, nutrition facts, cost estimate, and what the community thinks.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Review all ingredients before you start cooking",
          "Read complete instructions top to bottom first",
          "Check community ratings and reviews for insights",
        ],
        action: "click",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
      },
      {
        id: 4,
        title: "Join the Community",
        description: "Ratings, reviews, and favoriting help everyone find the best recipes. Rate recipes you love, read other cooks' experiences, and bookmark your favorites.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Read reviews to learn cooking tips from others",
          "Mark recipes as favorites for quick access later",
          "Your ratings help the community discover great recipes",
        ],
        action: "highlight",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Click on any recipe card to view its details, ratings, and reviews from other cooks.",
            highlightSelector: "[data-tutorial='recipe-card']",
            action: "click",
            actionTarget: "[data-tutorial='recipe-card']",
          },
          {
            id: 2,
            instruction: "Read through the community reviews to see what other cooks thought about the recipe.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Click the heart icon to favorite this recipe for quick access later.",
            action: "click",
          },
          {
            id: 4,
            instruction: "Leave a star rating to help other cooks find great recipes.",
            action: "click",
          },
        ],
      },
      {
        id: 5,
        title: "Weekly Meal Planning Made Easy",
        description: "Plan your week by choosing 3-4 recipes. Add them to your meal planner for specific days. This keeps cooking consistent and prevents last-minute decisions.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Plan around your busy days",
          "Group recipes with similar ingredients to save time",
          "Balance easy recipes with ones you want to master",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Go to Meal Planner",
        estimatedSeconds: 60,
        substeps: [
          {
            id: 1,
            instruction: "Look at the calendar view showing each day of the week.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Click the 'Add Recipe' button to add a recipe to a specific day.",
            highlightSelector: "[data-tutorial='meal-plan-add']",
            action: "click",
            actionTarget: "[data-tutorial='meal-plan-add']",
          },
          {
            id: 3,
            instruction: "Select 2-3 recipes from your favorites or search for new ones to add.",
            action: "explore",
          },
          {
            id: 4,
            instruction: "Assign each recipe to different days of the week to create a balanced plan.",
            action: "explore",
          },
        ],
      },
      {
        id: 6,
        title: "Smart Shopping from Your Meal Plan",
        description: "Your planned recipes auto-populate a shopping list. See ingredient costs and prices from different stores. Buy confident, cook happy.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "Shopping list builds automatically from your meal plan",
          "Compare prices to find the best deals",
          "Seasonal produce improves flavor and value",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go Shopping",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Notice how your shopping list was automatically created from the recipes you planned.",
            highlightSelector: "[data-tutorial='shopping-list']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Look at the ingredient prices from different stores. You can compare and choose the best deals.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Click on different store names to see which offers the best prices for your items.",
            action: "explore",
          },
          {
            id: 4,
            instruction: "Check off items as you add them to your cart to stay organized while shopping.",
            action: "explore",
          },
        ],
      },
      {
        id: 7,
        title: "Ready to Cook",
        description: "You now know how to find great recipes, plan meals, shop smart, and tap into a community of home cooks. Time to start cooking.",
        page: "/dashboard",
        tips: [
          "Prep all ingredients before you start (mise en place)",
          "Follow recipes step-by-step the first time you make them",
          "Upload your own recipes when you've mastered them",
        ],
        action: "navigate",
        actionTarget: "/dashboard",
        nextButtonText: "Complete Tutorial",
        estimatedSeconds: 20,
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
        title: "Welcome to Smart Shopping",
        description: "Let's learn how to save money on groceries by comparing prices and making strategic choices.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's Go",
        estimatedSeconds: 20,
      },
      {
        id: 2,
        title: "Build Your Shopping List",
        description: "Add items to your shopping list and we'll show you prices from different stores. Start with essentials.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-add-item']",
        tips: [
          "Add items you need for the week",
          "Include proteins, vegetables, and pantry staples",
          "Think about meals you want to cook",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go to Shopping",
        estimatedSeconds: 60,
        substeps: [
          {
            id: 1,
            instruction: "Click the 'Add Item' button to start building your shopping list.",
            highlightSelector: "[data-tutorial='shopping-add-item']",
            action: "click",
            actionTarget: "[data-tutorial='shopping-add-item']",
          },
          {
            id: 2,
            instruction: "Add proteins, vegetables, and pantry staples you'll need for the week.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Include items for meals you're planning to cook.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Compare Prices Across Stores",
        description: "See the same items priced differently at different stores. Choose the best deals and save money.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='price-comparison']",
        tips: [
          "Compare unit prices for the best value",
          "Look for store loyalty discounts",
          "Buy in bulk when prices are good",
        ],
        action: "highlight",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Look at the price comparison table. Notice how the same items are priced differently at each store.",
            highlightSelector: "[data-tutorial='price-comparison']",
            action: "highlight",
          },
          {
            id: 2,
            instruction: "Click on each store name to see their pricing for your items.",
            action: "explore",
          },
          {
            id: 3,
            instruction: "Select the store with the best overall prices to save money on your groceries.",
            action: "explore",
          },
        ],
      },
      {
        id: 4,
        title: "Find Budget-Friendly Recipes",
        description: "Discover recipes that use affordable ingredients. Build meals around items on sale or in bulk.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Filter by cost-effective ingredients",
          "Choose recipes with pantry staples",
          "Use similar ingredients across multiple recipes",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse Budget Recipes",
        estimatedSeconds: 60,
      },
      {
        id: 5,
        title: "Plan Budget Meals",
        description: "Organize budget-friendly recipes into your meal plan. Group recipes that share ingredients to minimize waste.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Plan meals around sale items",
          "Use overlapping ingredients across recipes",
          "Batch cook to save time and money",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Plan Budget Meals",
        estimatedSeconds: 60,
      },
      {
        id: 6,
        title: "Budget Master!",
        description: "You now know how to compare prices, find budget recipes, and plan meals strategically. Start saving today!",
        page: "/dashboard",
        tips: [
          "Check for weekly store deals and sales",
          "Plan meals around what's in season",
          "Track your savings over time",
        ],
        action: "navigate",
        actionTarget: "/dashboard",
        nextButtonText: "Complete Tutorial",
        estimatedSeconds: 20,
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
        title: "Welcome to Healthy Eating",
        description: "Let's explore how Secret Sauce helps you eat healthy meals, save time, and feel your best.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's Begin",
        estimatedSeconds: 20,
      },
      {
        id: 2,
        title: "Plan Your Healthy Week",
        description: "Start with Meal Planning. Organize your week with 4-5 nutritious recipes that fit your schedule.",
        page: "/meal-planner",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Plan meals around your busy schedule",
          "Aim for variety in nutrition and cuisines",
          "Prep components in advance for convenience",
        ],
        action: "navigate",
        actionTarget: "/meal-planner",
        nextButtonText: "Go to Meal Planner",
        estimatedSeconds: 60,
        substeps: [
          {
            id: 1,
            instruction: "Review your calendar for busy days. This helps you choose recipes that fit your schedule.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Click 'Add Recipe' and select 4-5 nutritious recipes with variety in cuisines and nutrients.",
            highlightSelector: "[data-tutorial='meal-plan-add']",
            action: "click",
            actionTarget: "[data-tutorial='meal-plan-add']",
          },
          {
            id: 3,
            instruction: "Spread the recipes throughout the week to ensure balanced nutrition and variety.",
            action: "explore",
          },
        ],
      },
      {
        id: 3,
        title: "Find Healthy Recipes",
        description: "Browse our recipes and filter by cooking time, cuisine, and health goals. Find meals ready in 30 minutes.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Filter for quick recipes under 30 minutes",
          "Search by dietary needs (vegetarian, etc.)",
          "Read reviews from other healthy eaters",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse Recipes",
        estimatedSeconds: 60,
      },
      {
        id: 4,
        title: "Check Nutrition Information",
        description: "Every recipe shows complete nutrition facts. Review calories, macros, sodium, and sugar content.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='nutrition-info']",
        tips: [
          "Check sodium and sugar per serving",
          "Balance protein, carbs, and healthy fats",
          "Adjust portion sizes to fit your goals",
        ],
        action: "highlight",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
        substeps: [
          {
            id: 1,
            instruction: "Click on a recipe to view its complete nutrition information panel.",
            action: "explore",
          },
          {
            id: 2,
            instruction: "Review the calories, protein, carbs, fat, sodium, and sugar per serving.",
            highlightSelector: "[data-tutorial='nutrition-info']",
            action: "highlight",
          },
          {
            id: 3,
            instruction: "Check if the nutrition aligns with your health goals. Note the sodium and sugar content.",
            action: "explore",
          },
          {
            id: 4,
            instruction: "Adjust portion sizes if needed to fit your daily nutrition targets.",
            action: "explore",
          },
        ],
      },
      {
        id: 5,
        title: "Smart Healthy Shopping",
        description: "Create your shopping list from planned meals. Find fresh, quality ingredients for healthy cooking.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "Buy fresh, seasonal produce when possible",
          "Check ingredient labels for additives",
          "Select organic for produce when available",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go Shopping",
        estimatedSeconds: 45,
      },
      {
        id: 6,
        title: "Your Healthy Routine Starts Now!",
        description: "You now know how to plan healthy meals, find nutritious recipes, and shop smart. Start your journey today!",
        page: "/dashboard",
        tips: [
          "Batch cook on weekends for the week ahead",
          "Track how you feel with different meals",
          "Explore new healthy cuisines regularly",
        ],
        action: "navigate",
        actionTarget: "/dashboard",
        nextButtonText: "Complete Tutorial",
        estimatedSeconds: 20,
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
