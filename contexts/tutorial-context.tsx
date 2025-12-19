"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "./auth-context"

import type {
  TutorialPath,
  TutorialStep,
  TutorialSubstep,
} from "../contents/tutorial-content"

import { tutorialPaths } from "../contents/tutorial-content"

interface TutorialContextType {
  isActive: boolean
  currentPath: TutorialPath | null

  currentStepIndex: number
  currentStep: TutorialStep | null

  currentSubstepIndex: number
  currentSubstep: TutorialSubstep | null

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
  if (!context) throw new Error("useTutorial must be used within a TutorialProvider")
  return context
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [currentPathId, setCurrentPathId] = useState<"cooking" | "budgeting" | "health" | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [redirectAfterComplete, setRedirectAfterComplete] = useState<string | null>(null)
  const [wasDismissed, setWasDismissed] = useState(false)
  const router = useRouter()
  const { user, profile } = useAuth()
  const DISMISS_KEY = "tutorial_dismissed_v1"

  const currentPath = currentPathId ? tutorialPaths[currentPathId] : null
  const currentStep = currentPath ? currentPath.steps[currentStepIndex] : null
  const currentSubstep = currentStep?.substeps?.[currentSubstepIndex] ?? null

  // -------------------
  // Core Functions
  // -------------------

  const startTutorial = useCallback((pathId: "cooking" | "budgeting" | "health") => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
    setCurrentPathId(pathId)
    setCurrentStepIndex(0)
    setCurrentSubstepIndex(0)
    setIsActive(true)
    setIsCompleted(false)
  }, [])

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

      if (redirectAfterComplete) {
        router.push(redirectAfterComplete)
      }
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, currentPathId, redirectAfterComplete, router])

  // -------------------
  // Navigation Functions
  // -------------------

  const nextStep = useCallback(() => {
    if (!currentStep || !currentPath) return

    const substeps = currentStep.substeps ?? []

    if (currentSubstepIndex < substeps.length - 1) {
      setCurrentSubstepIndex(prev => prev + 1)
    } else if (currentStepIndex < currentPath.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
      setCurrentSubstepIndex(0)
    } else {
      completeTutorial()
    }
  }, [currentStep, currentPath, currentSubstepIndex, currentStepIndex, completeTutorial])

  const prevStep = useCallback(() => {
    if (!currentStep || !currentPath) return

    if (currentSubstepIndex > 0) {
      setCurrentSubstepIndex(prev => prev - 1)
    } else if (currentStepIndex > 0) {
      const prevStep = currentPath.steps[currentStepIndex - 1]
      setCurrentStepIndex(prev => prev - 1)
      setCurrentSubstepIndex((prevStep.substeps?.length ?? 1) - 1)
    }
  }, [currentStepIndex, currentSubstepIndex, currentPath, currentStep])

  const goToStep = useCallback((stepIndex: number) => {
    if (currentPath && stepIndex >= 0 && stepIndex < currentPath.steps.length) {
      setCurrentStepIndex(stepIndex)
      setCurrentSubstepIndex(0)
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

  const resetTutorial = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
    setIsActive(true)
    setCurrentStepIndex(0)
    setCurrentSubstepIndex(0)
    setIsCompleted(false)
  }, [])

  // -------------------
  // Effects
  // -------------------

  // Load dismissed state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(DISMISS_KEY)
    setWasDismissed(stored === "1")
  }, [])

  // Auto-start tutorial if appropriate
  useEffect(() => {
    if (!user || !profile) return
    if (profile.tutorial_completed === true && !isActive) return
    if (profile.primary_goal && !isActive && !isCompleted && !wasDismissed) {
      const pathMap: Record<string, "cooking" | "budgeting" | "health"> = {
        cooking: "cooking",
        budgeting: "budgeting",
        both: "health",
      }
      const pathId = pathMap[profile.primary_goal]
      if (pathId) startTutorial(pathId)
    }
  }, [user, profile, isActive, isCompleted, wasDismissed, startTutorial])

  // -------------------
  // Context Value
  // -------------------

  const value: TutorialContextType = {
    isActive,
    currentPath,
    currentStepIndex,
    currentStep,
    currentSubstepIndex,
    currentSubstep,
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
