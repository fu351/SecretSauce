"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-context"
import { useAnalytics } from "@/hooks/use-analytics"

import type {
  TutorialPath,
  TutorialStep,
  TutorialSubstep,
} from "../contents/tutorial-content"

import { tutorialPaths } from "../contents/tutorial-content"

type TutorialPathId = "cooking" | "budgeting" | "health"

function isTutorialPathId(value: unknown): value is TutorialPathId {
  return value === "cooking" || value === "budgeting" || value === "health"
}

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
  tutorialPath: TutorialPathId | null
  tutorialCompletedAt: string | null

  startTutorial: (pathId: TutorialPathId) => void
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
  const [currentPathId, setCurrentPathId] = useState<TutorialPathId | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [redirectAfterComplete, setRedirectAfterComplete] = useState<string | null>(null)
  const [wasDismissed, setWasDismissed] = useState(false)
  const [tutorialCompleted, setTutorialCompleted] = useState(false)
  const [tutorialPath, setTutorialPath] = useState<TutorialPathId | null>(null)
  const [tutorialCompletedAt, setTutorialCompletedAt] = useState<string | null>(null)
  const router = useRouter()
  const { user, profile, updateProfile } = useAuth()
  const { trackEvent } = useAnalytics()
  const DISMISS_KEY = "tutorial_dismissed_v1"
  const TUTORIAL_STATE_KEY = "tutorial_state_v1"

  const currentPath = currentPathId ? tutorialPaths[currentPathId] : null
  const currentStep = currentPath ? currentPath.steps[currentStepIndex] : null
  const currentSubstep = currentStep?.substeps?.[currentSubstepIndex] ?? null

  // Save tutorial state to localStorage
  const saveTutorialState = useCallback(() => {
    if (typeof window === "undefined") return

    if (!isActive || !currentPathId) {
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      return
    }

    window.localStorage.setItem(
      TUTORIAL_STATE_KEY,
      JSON.stringify({
        pathId: currentPathId,
        stepIndex: currentStepIndex,
        substepIndex: currentSubstepIndex,
      })
    )
  }, [currentPathId, currentStepIndex, currentSubstepIndex, isActive])

  // Restore tutorial state from localStorage
  const restoreTutorialState = useCallback(() => {
    if (typeof window === "undefined") return

    // Respect explicit dismissal and avoid forcing a restore
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return

    const stored = window.localStorage.getItem(TUTORIAL_STATE_KEY)
    if (stored) {
      try {
        const state = JSON.parse(stored)
        if (!isTutorialPathId(state.pathId)) {
          window.localStorage.removeItem(TUTORIAL_STATE_KEY)
          return
        }

        setCurrentPathId(state.pathId)
        setCurrentStepIndex(Number.isInteger(state.stepIndex) ? state.stepIndex : 0)
        setCurrentSubstepIndex(Number.isInteger(state.substepIndex) ? state.substepIndex : 0)
        setIsActive(true)
      } catch (e) {
        console.error("Failed to restore tutorial state:", e)
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    }
  }, [])

  // -------------------
  // Core Functions
  // -------------------

  const startTutorial = useCallback((pathId: TutorialPathId) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
    setCurrentPathId(pathId)
    setCurrentStepIndex(0)
    setCurrentSubstepIndex(0)
    setIsActive(true)
    setIsCompleted(false)
    trackEvent("tutorial_started", { path: pathId })
  }, [trackEvent])

  const completeTutorial = useCallback(async () => {
    if (!user || !currentPathId) return
    try {
      const completedAt = new Date().toISOString()

      await updateProfile({
        tutorial_completed: true,
        tutorial_completed_at: completedAt,
        tutorial_path: currentPathId,
      })

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
        window.localStorage.removeItem(DISMISS_KEY)
      }

      console.log("Tutorial completed successfully")

      setIsActive(false)
      setIsCompleted(true)
      setTutorialCompleted(true)
      setTutorialPath(currentPathId)
      setTutorialCompletedAt(completedAt)
      setWasDismissed(false)

      trackEvent("tutorial_completed", {
        path: currentPathId,
        steps_completed: currentPath?.steps.length ?? currentStepIndex + 1,
      })

      if (redirectAfterComplete) {
        router.push(redirectAfterComplete)
      }
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, currentPathId, updateProfile, currentPath, currentStepIndex, trackEvent, redirectAfterComplete, router])

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

      if (currentPathId) {
        trackEvent("tutorial_step_completed", {
          path: currentPathId,
          step_index: currentStepIndex + 1,
        })
      }

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
      if (currentPathId) {
        trackEvent("tutorial_step_completed", {
          path: currentPathId,
          step_index: currentStepIndex + 1,
        })
      }
      // 3. No more steps or substeps = Tutorial Complete
      completeTutorial()
    }
  }, [currentStep, currentPath, currentPathId, currentSubstepIndex, currentStepIndex, trackEvent, completeTutorial, router])

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
      if (currentPathId) {
        trackEvent("tutorial_skipped", {
          path: currentPathId,
          step_abandoned: currentStepIndex + 1,
        })
      }

      setIsActive(false)
      setIsCompleted(false)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DISMISS_KEY, "1")
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
        setWasDismissed(true)
      }
    } catch (error) {
      console.error("Error skipping tutorial:", error)
    }
  }, [user, currentPathId, currentStepIndex, trackEvent])

  const resetTutorial = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
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
  }, [currentPathId, currentStepIndex, currentSubstepIndex, isActive, saveTutorialState])

  // Sync persisted tutorial state from profile
  useEffect(() => {
    if (!profile) return
    setTutorialCompleted(profile.tutorial_completed === true)
    setTutorialCompletedAt(profile.tutorial_completed_at ?? null)
    setTutorialPath(isTutorialPathId(profile.tutorial_path) ? profile.tutorial_path : null)

    // Profile completion is source of truth; clear any stale in-progress local state
    if (profile.tutorial_completed === true) {
      setIsActive(false)
      setIsCompleted(true)
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    }
  }, [profile])

  // Auto-start tutorial if appropriate
  useEffect(() => {
    if (!user || !profile) return
    if (profile.tutorial_completed === true && !isActive) return
    if (profile.primary_goal && !isActive && !isCompleted && !wasDismissed) {
      const pathMap: Record<string, TutorialPathId> = {
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
    tutorialPath,
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
