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
  GoalRank,
  RankedGoals,
} from "../contents/tutorial-content"

import { tutorialPaths } from "../contents/tutorial-content"

type TutorialPathId = "cooking" | "budgeting" | "health"

function isTutorialPathId(value: unknown): value is TutorialPathId {
  return value === "cooking" || value === "budgeting" || value === "health"
}

function isRankedGoals(value: unknown): value is RankedGoals {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(isTutorialPathId)
  )
}

/**
 * Returns substeps visible for a given rank.
 * Rank 1: all substeps
 * Rank 2: first substep only
 * Rank 3: only essential substeps (fallback to first if none marked)
 */
export function getVisibleSubsteps(step: TutorialStep, rank: GoalRank): TutorialSubstep[] {
  const substeps = step.substeps ?? []
  if (substeps.length === 0) return []
  if (rank === 1) return substeps
  if (rank === 2) return substeps.slice(0, 1)
  // rank === 3: essential only
  const essential = substeps.filter(s => s.essential)
  return essential.length > 0 ? essential : substeps.slice(0, 1)
}

interface TutorialContextType {
  isActive: boolean
  currentPath: TutorialPath | null
  currentPlanIndex: number
  currentRank: GoalRank
  rankedGoals: RankedGoals | null

  currentStepIndex: number
  currentStep: TutorialStep | null

  currentSubstepIndex: number
  currentSubstep: TutorialSubstep | null
  visibleSubsteps: TutorialSubstep[]

  isCompleted: boolean
  wasDismissed: boolean
  tutorialCompleted: boolean
  tutorialPath: TutorialPathId | null
  tutorialCompletedAt: string | null

  startRankedSession: (ranked: RankedGoals) => void
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
  const [rankedGoals, setRankedGoals] = useState<RankedGoals | null>(null)
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0)
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
  // Bump this when the payload shape changes; old payloads will be silently discarded
  const TUTORIAL_STATE_VERSION = 2

  // Derived state
  const currentPathId = rankedGoals ? rankedGoals[currentPlanIndex] : null
  const currentPath = currentPathId ? tutorialPaths[currentPathId] : null
  const currentRank = (Math.min(currentPlanIndex + 1, 3)) as GoalRank
  const currentStep = currentPath ? currentPath.steps[currentStepIndex] : null
  const visibleSubsteps = currentStep ? getVisibleSubsteps(currentStep, currentRank) : []
  const currentSubstep = visibleSubsteps[currentSubstepIndex] ?? null

  // Save tutorial state to localStorage
  const saveTutorialState = useCallback(() => {
    if (typeof window === "undefined") return

    if (!isActive || !rankedGoals) {
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      return
    }

    window.localStorage.setItem(
      TUTORIAL_STATE_KEY,
      JSON.stringify({
        version: TUTORIAL_STATE_VERSION,
        rankedGoals,
        currentPlanIndex,
        stepIndex: currentStepIndex,
        substepIndex: currentSubstepIndex,
      })
    )
  }, [rankedGoals, currentPlanIndex, currentStepIndex, currentSubstepIndex, isActive])

  // Restore tutorial state from localStorage
  const restoreTutorialState = useCallback(() => {
    if (typeof window === "undefined") return

    if (window.localStorage.getItem(DISMISS_KEY) === "1") return

    const stored = window.localStorage.getItem(TUTORIAL_STATE_KEY)
    if (stored) {
      try {
        const state = JSON.parse(stored)
        if (state.version !== TUTORIAL_STATE_VERSION) {
          window.localStorage.removeItem(TUTORIAL_STATE_KEY)
          return
        }
        if (!isRankedGoals(state.rankedGoals)) {
          window.localStorage.removeItem(TUTORIAL_STATE_KEY)
          return
        }

        setRankedGoals(state.rankedGoals)
        setCurrentPlanIndex(Number.isInteger(state.currentPlanIndex) ? state.currentPlanIndex : 0)
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

  const startRankedSession = useCallback((ranked: RankedGoals) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      setWasDismissed(false)
    }
    setRankedGoals(ranked)
    setCurrentPlanIndex(0)
    setCurrentStepIndex(0)
    setCurrentSubstepIndex(0)
    setIsActive(true)
    setIsCompleted(false)
    trackEvent("tutorial_started", { path: ranked[0] })
    const firstPage = tutorialPaths[ranked[0]].steps[0].page
    router.push(firstPage)
  }, [trackEvent, router])

  const startTutorial = useCallback((pathId: TutorialPathId) => {
    const others = (["cooking", "budgeting", "health"] as TutorialPathId[]).filter(id => id !== pathId)
    const ranked: RankedGoals = [pathId, others[0], others[1]]
    startRankedSession(ranked)
  }, [startRankedSession])

  const completeTutorial = useCallback(async () => {
    if (!user || !currentPathId || !rankedGoals) return
    try {
      const completedAt = new Date().toISOString()

      await updateProfile({
        tutorial_completed: true,
        tutorial_completed_at: completedAt,
        tutorial_path: rankedGoals[0],
        tutorial_goals_ranking: [...rankedGoals],
      })

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
        window.localStorage.removeItem(DISMISS_KEY)
      }

      setIsActive(false)
      setIsCompleted(true)
      setTutorialCompleted(true)
      setTutorialPath(rankedGoals[0])
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
  }, [user, currentPathId, rankedGoals, updateProfile, currentPath, currentStepIndex, trackEvent, redirectAfterComplete, router])

  // -------------------
  // Navigation Functions
  // -------------------

  const nextStep = useCallback(() => {
    if (!currentStep || !currentPath || !rankedGoals) return

    // 1. Advance substep
    if (currentSubstepIndex < visibleSubsteps.length - 1) {
      setCurrentSubstepIndex(prev => prev + 1)
      return
    }

    // 2. Advance main step within current path
    if (currentStepIndex < currentPath.steps.length - 1) {
      const nextIndex = currentStepIndex + 1
      const nextStepData = currentPath.steps[nextIndex]

      if (currentPathId) {
        trackEvent("tutorial_step_completed", {
          path: currentPathId,
          step_index: currentStepIndex + 1,
        })
      }

      const targetPage = nextStepData.page.toLowerCase()
      const currentPage = window.location.pathname.toLowerCase()
      if (targetPage && targetPage !== currentPage) {
        router.push(nextStepData.page)
      }

      setCurrentStepIndex(nextIndex)
      setCurrentSubstepIndex(0)
      return
    }

    // 3. End of current path — track and advance to next plan (silent transition)
    if (currentPathId) {
      trackEvent("tutorial_step_completed", {
        path: currentPathId,
        step_index: currentStepIndex + 1,
      })
    }

    if (currentPlanIndex < rankedGoals.length - 1) {
      const nextPlanIndex = currentPlanIndex + 1
      const nextPathId = rankedGoals[nextPlanIndex]

      trackEvent("tutorial_path_advanced", {
        from_path: currentPathId!,
        to_path: nextPathId,
        plan_index: nextPlanIndex,
      })
      trackEvent("tutorial_started", { path: nextPathId })

      setCurrentPlanIndex(nextPlanIndex)
      setCurrentStepIndex(0)
      setCurrentSubstepIndex(0)

      // Silent transition: just navigate to next path's first page
      const firstPage = tutorialPaths[nextPathId].steps[0].page
      router.push(firstPage)
    } else {
      completeTutorial()
    }
  }, [currentStep, currentPath, currentPathId, currentPlanIndex, rankedGoals, currentSubstepIndex, visibleSubsteps, currentStepIndex, trackEvent, completeTutorial, router])

  const prevStep = useCallback(() => {
    if (!currentStep || !currentPath) return

    // 1. Go back a substep
    if (currentSubstepIndex > 0) {
      setCurrentSubstepIndex(prev => prev - 1)
      return
    }

    // 2. Go back a main step (no cross-path back navigation)
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1
      const prevStepData = currentPath.steps[prevIndex]

      const targetPage = prevStepData.page.toLowerCase()
      const currentPage = window.location.pathname.toLowerCase()
      if (targetPage && targetPage !== currentPage) {
        router.push(prevStepData.page)
      }

      setCurrentStepIndex(prevIndex)

      // Land on last visible substep of the previous step when rewinding
      const prevVisibleSubsteps = getVisibleSubsteps(prevStepData, currentRank)
      setCurrentSubstepIndex(Math.max(0, prevVisibleSubsteps.length - 1))
    }
  }, [currentStepIndex, currentSubstepIndex, currentPath, currentStep, currentRank, router])

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
    setIsActive(false)
    setRankedGoals(null)
    setCurrentPlanIndex(0)
    setCurrentStepIndex(0)
    setCurrentSubstepIndex(0)
    setIsCompleted(false)
  }, [])

  // -------------------
  // Effects
  // -------------------

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(DISMISS_KEY)
    setWasDismissed(stored === "1")
    restoreTutorialState()
  }, [restoreTutorialState])

  useEffect(() => {
    saveTutorialState()
  }, [rankedGoals, currentPlanIndex, currentStepIndex, currentSubstepIndex, isActive, saveTutorialState])

  useEffect(() => {
    if (!profile) return
    setTutorialCompleted(profile.tutorial_completed === true)
    setTutorialCompletedAt(profile.tutorial_completed_at ?? null)
    setTutorialPath(isTutorialPathId(profile.tutorial_path) ? profile.tutorial_path : null)

    if (profile.tutorial_completed === true) {
      setIsActive(false)
      setIsCompleted(true)
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    }
  }, [profile])

  // -------------------
  // Context Value
  // -------------------

  const value: TutorialContextType = {
    isActive,
    currentPath,
    currentPlanIndex,
    currentRank,
    rankedGoals,
    currentStepIndex,
    currentStep,
    currentSubstepIndex,
    currentSubstep,
    visibleSubsteps,
    isCompleted,
    wasDismissed,
    tutorialCompleted,
    tutorialPath,
    tutorialCompletedAt,
    startRankedSession,
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
