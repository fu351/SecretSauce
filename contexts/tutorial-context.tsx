"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "./auth-context"

export interface TutorialStep {
  id: number
  title: string
  description: string
  tips?: string[]
  page: string // URL path like /recipes, /meal-plan
  highlightSelector?: string // CSS selector to highlight
  action?: "navigate" | "click" | "highlight"
  actionTarget?: string // Element to click or URL to navigate to
  nextButtonText?: string
  estimatedSeconds?: number
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
  skipTutorial: () => void
  completeTutorial: () => void
  resetTutorial: () => void
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
        title: "Welcome to Your Culinary Journey",
        description: "Let's explore Secret Sauce and learn how to find amazing recipes.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's Start",
        estimatedSeconds: 20,
      },
      {
        id: 2,
        title: "Discover Recipes",
        description: "Browse our curated collection. Try filtering by difficulty level to match your skills.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Use filters to find recipes at your current skill level",
          "Read the full recipe before you start cooking",
          "Check prep and cook times to plan your day",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Explore Recipes",
        estimatedSeconds: 60,
      },
      {
        id: 3,
        title: "Pick a Recipe",
        description: "Click on any recipe card to see the full details, ingredients, and instructions.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-card']",
        tips: [
          "Start with beginner recipes to build confidence",
          "Check the rating and reviews from other cooks",
          "Note any ingredient substitutions you might need",
        ],
        action: "highlight",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
      },
      {
        id: 4,
        title: "Plan Your Week",
        description: "Visit Meal Planning to organize your cooking schedule. Plan 3-4 recipes per week.",
        page: "/meal-plan",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Mix easy and moderate recipes in your plan",
          "Group recipes with similar ingredients to save time",
          "Plan meals around your schedule",
        ],
        action: "navigate",
        actionTarget: "/meal-plan",
        nextButtonText: "Go to Meal Plan",
        estimatedSeconds: 60,
      },
      {
        id: 5,
        title: "Smart Shopping",
        description: "Create a shopping list with prices. Compare prices across stores to get the best deals.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "Quality ingredients make a huge difference",
          "Check seasonal produce for better flavor and value",
          "Buy in bulk when you use items frequently",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "View Shopping",
        estimatedSeconds: 45,
      },
      {
        id: 6,
        title: "Start Cooking!",
        description: "Pick your first recipe and follow the step-by-step instructions. Enjoy the process!",
        page: "/recipes",
        tips: [
          "Prep all ingredients before you start (mise en place)",
          "Follow the recipe exactly the first time",
          "Note any improvements for next time",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Start Your First Cook",
        estimatedSeconds: 30,
      },
      {
        id: 7,
        title: "You're Ready!",
        description: "You now know how to use Secret Sauce. Keep exploring and growing your culinary skills!",
        page: "/dashboard",
        tips: [
          "Come back anytime for new recipes",
          "Share your creations with friends",
          "Try new cuisines and techniques",
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
        description: "Let's learn how to save money on groceries with smart planning.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's Go",
        estimatedSeconds: 20,
      },
      {
        id: 2,
        title: "Create Your Shopping List",
        description: "Start by building a shopping list. Add items and we'll show you prices from different stores.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-add-item']",
        tips: [
          "Group items by category for efficiency",
          "Check expiry dates and storage instructions",
          "Buy seasonal produce for better prices",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go to Shopping",
        estimatedSeconds: 60,
      },
      {
        id: 3,
        title: "Compare Prices",
        description: "See prices from different stores. Choose the best deals for each item.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='price-comparison']",
        tips: [
          "Use unit prices to compare value",
          "Check for store loyalty discounts",
          "Buy in bulk at stores with better prices",
        ],
        action: "highlight",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
      },
      {
        id: 4,
        title: "Find Budget Recipes",
        description: "Browse recipes filtered by cost. Find delicious meals that fit your budget.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Use ingredients across multiple recipes",
          "Choose recipes with pantry staples",
          "Batch cook to save time and money",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse Recipes",
        estimatedSeconds: 60,
      },
      {
        id: 5,
        title: "Plan Strategically",
        description: "Use Meal Planning to organize budget-friendly recipes for the week.",
        page: "/meal-plan",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Plan meals with overlapping ingredients",
          "Use sales and discounts for planning",
          "Prep in batches to minimize waste",
        ],
        action: "navigate",
        actionTarget: "/meal-plan",
        nextButtonText: "Plan Your Week",
        estimatedSeconds: 60,
      },
      {
        id: 6,
        title: "Track Your Savings",
        description: "Monitor your spending and watch your savings grow with smart choices.",
        page: "/shopping",
        tips: [
          "Set weekly budget targets",
          "Track price trends for your favorite items",
          "Share deals with friends",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "View Your Savings",
        estimatedSeconds: 30,
      },
      {
        id: 7,
        title: "Budget Master!",
        description: "You now have the tools to eat well on a budget. Start saving today!",
        page: "/dashboard",
        tips: [
          "Check back regularly for new budget recipes",
          "Set spending goals and track progress",
          "Share tips with your community",
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
        description: "Let's explore how Secret Sauce helps you eat well and save time.",
        page: "/dashboard",
        action: "highlight",
        nextButtonText: "Let's Begin",
        estimatedSeconds: 20,
      },
      {
        id: 2,
        title: "Plan Your Meals",
        description: "Start with Meal Planning. Organize your week with nutritious, efficient recipes.",
        page: "/meal-plan",
        highlightSelector: "[data-tutorial='meal-plan-add']",
        tips: [
          "Plan around your weekly schedule",
          "Include variety in your nutrition",
          "Prep meals in advance for convenience",
        ],
        action: "navigate",
        actionTarget: "/meal-plan",
        nextButtonText: "Go to Meal Plan",
        estimatedSeconds: 60,
      },
      {
        id: 3,
        title: "Find Quick Recipes",
        description: "Browse recipes filtered by cook time. Find healthy meals you can make in 30 minutes.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='recipe-filter']",
        tips: [
          "Filter for recipes under 30 minutes",
          "Check nutrition information",
          "Choose recipes with whole ingredients",
        ],
        action: "navigate",
        actionTarget: "/recipes",
        nextButtonText: "Browse Quick Recipes",
        estimatedSeconds: 60,
      },
      {
        id: 4,
        title: "Understand Nutrition",
        description: "Each recipe shows complete nutrition facts. Track calories, macros, and more.",
        page: "/recipes",
        highlightSelector: "[data-tutorial='nutrition-info']",
        tips: [
          "Check sodium and sugar content",
          "Balance macronutrients throughout the day",
          "Adjust portions to fit your goals",
        ],
        action: "highlight",
        nextButtonText: "Continue",
        estimatedSeconds: 45,
      },
      {
        id: 5,
        title: "Smart Shopping",
        description: "Create a shopping list with your planned meals. Find the freshest, healthiest ingredients.",
        page: "/shopping",
        highlightSelector: "[data-tutorial='shopping-list']",
        tips: [
          "Buy fresh, seasonal produce",
          "Check ingredient labels",
          "Choose organic when possible",
        ],
        action: "navigate",
        actionTarget: "/shopping",
        nextButtonText: "Go Shopping",
        estimatedSeconds: 45,
      },
      {
        id: 6,
        title: "Optimize Your Routine",
        description: "Use meal prep and batch cooking to save time during the week. Eat well consistently.",
        page: "/meal-plan",
        tips: [
          "Prep components on Sunday",
          "Cook proteins in bulk",
          "Store meals properly for freshness",
        ],
        action: "navigate",
        actionTarget: "/meal-plan",
        nextButtonText: "Master Meal Prep",
        estimatedSeconds: 30,
      },
      {
        id: 7,
        title: "Your Healthy Routine Starts Now!",
        description: "You have everything you need to eat healthy, save time, and feel great!",
        page: "/dashboard",
        tips: [
          "Set health goals and track progress",
          "Explore new recipes regularly",
          "Enjoy the journey to better health",
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
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, currentPathId])

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
    skipTutorial,
    completeTutorial,
    resetTutorial,
  }

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}
