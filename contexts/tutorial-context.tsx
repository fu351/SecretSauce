"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
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
  tutorialCompleted: boolean
  tutorialCompletedAt: string | null

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
  const [tutorialCompleted, setTutorialCompleted] = useState(false)
  const [tutorialCompletedAt, setTutorialCompletedAt] = useState<string | null>(null)
  const router = useRouter()
  const { user, profile, updateProfile } = useAuth()
  const DISMISS_KEY = "tutorial_dismissed_v1"
  const TUTORIAL_STATE_KEY = "tutorial_state_v1"

  const currentPath = currentPathId ? tutorialPaths[currentPathId] : null
  const currentStep = currentPath ? currentPath.steps[currentStepIndex] : null
  const currentSubstep = currentStep?.substeps?.[currentSubstepIndex] ?? null

  // Save tutorial state to localStorage
  const saveTutorialState = useCallback(() => {
    if (typeof window !== "undefined" && currentPathId) {
      window.localStorage.setItem(TUTORIAL_STATE_KEY, JSON.stringify({
        pathId: currentPathId,
        stepIndex: currentStepIndex,
        substepIndex: currentSubstepIndex,
      }))
    }
  }, [currentPathId, currentStepIndex, currentSubstepIndex])

  // Restore tutorial state from localStorage
  const restoreTutorialState = useCallback(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(TUTORIAL_STATE_KEY)
    if (stored) {
      try {
        const state = JSON.parse(stored)
        setCurrentPathId(state.pathId)
        setCurrentStepIndex(state.stepIndex)
        setCurrentSubstepIndex(state.substepIndex)
        setIsActive(true)
      } catch (e) {
        console.error("Failed to restore tutorial state:", e)
      }
    }
  }, [])

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
      const completedAt = new Date().toISOString()

      await updateProfile({
        tutorial_completed: true,
      })

      console.log("Tutorial completed successfully")

      setIsActive(false)
      setIsCompleted(true)
      setTutorialCompleted(true)
      setTutorialCompletedAt(completedAt)

      if (redirectAfterComplete) {
        router.push(redirectAfterComplete)
      }
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, currentPathId, redirectAfterComplete, router, updateProfile])

  // -------------------
  // Navigation Functions
  // -------------------

  const nextStep = useCallback(() => {
    if (!currentStep || !currentPath) return

    const substeps = currentStep.substeps ?? []

    // 1. Advance Substep (Stay on same page)
    // We check if we are NOT at the last substep yet.
    if (currentSubstepIndex < substeps.length - 1) {
      setCurrentSubstepIndex(prev => prev + 1)
      return
    } 
    
    // 2. Advance Main Step (Check for PAGE change)
    // If we are at the end of substeps, we look for the next main Step.
    if (currentStepIndex < currentPath.steps.length - 1) {
      const nextIndex = currentStepIndex + 1
      const nextStepData = currentPath.steps[nextIndex]

      // AUTOLOAD: Check the 'page' property from your interface
      // We normalize strings to ensure slight formatting differences don't break it
      const targetPage = nextStepData.page.toLowerCase()
      const currentPage = window.location.pathname.toLowerCase()

      if (targetPage && targetPage !== currentPage) {
        router.push(nextStepData.page)
      }

      // Update state to the new Step, starting at the first Substep
      setCurrentStepIndex(nextIndex)
      setCurrentSubstepIndex(0) 
    } else {
      // 3. No more steps or substeps = Tutorial Complete
      completeTutorial()
    }
  }, [currentStep, currentPath, currentSubstepIndex, currentStepIndex, completeTutorial, router])

  const prevStep = useCallback(() => {
    if (!currentStep || !currentPath) return

    // 1. Go back a Substep (Stay on same page)
    if (currentSubstepIndex > 0) {
      setCurrentSubstepIndex(prev => prev - 1)
      return
    } 
    
    // 2. Go back a Main Step (Check for PAGE change)
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1
      const prevStepData = currentPath.steps[prevIndex]

      // AUTOLOAD: Check if the previous step requires a page change
      const targetPage = prevStepData.page.toLowerCase()
      const currentPage = window.location.pathname.toLowerCase()

      if (targetPage && targetPage !== currentPage) {
        router.push(prevStepData.page)
      }

      setCurrentStepIndex(prevIndex)
      
      // UX Detail: When going BACK to a previous Step, we usually want to 
      // land on the LAST substep of that page, so the user feels like 
      // they are "rewinding" linearly.
      const lastSubstepIndex = (prevStepData.substeps?.length ?? 1) - 1
      setCurrentSubstepIndex(lastSubstepIndex)
    }
  }, [currentStepIndex, currentSubstepIndex, currentPath, currentStep, router])

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

  // Load dismissed state and restore tutorial state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(DISMISS_KEY)
    setWasDismissed(stored === "1")
    restoreTutorialState()
  }, [restoreTutorialState])

  // Save tutorial state whenever it changes
  useEffect(() => {
    saveTutorialState()
  }, [currentPathId, currentStepIndex, currentSubstepIndex, saveTutorialState])

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
    tutorialCompleted,
    tutorialCompletedAt,
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
