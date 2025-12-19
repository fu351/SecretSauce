"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "./auth-context"

// --- CHANGE: Import data and types from the content aggregator ---
import { 
  type TutorialPath, 
  type TutorialStep, 
  tutorialPaths 
} from "../contents/tutorial-content"

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

  // Use the imported tutorialPaths object
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
      return
    }

    // If user has completed the tutorial, avoid auto-starting but allow manual rewatch
    if (profile.tutorial_completed === true && !isActive) {
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
        startTutorial(pathId)
      }
    }
  }, [user, profile, isActive, isCompleted, wasDismissed])

  const startTutorial = useCallback((pathId: "cooking" | "budgeting" | "health") => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
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