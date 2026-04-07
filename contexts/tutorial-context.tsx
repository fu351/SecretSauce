"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "./auth-context"
import { useAnalytics } from "@/hooks/use-analytics"
import { setTutorialToastSuppression } from "@/hooks/ui/use-toast"

import type {
  TutorialStep,
  TutorialSubstep,
  GoalRank,
  RankedGoals,
  GeneralPageEntry,
} from "../contents/tutorial-content"

import { tutorialPaths, generalPages } from "../contents/tutorial-content"

type TutorialPathId = "cooking" | "budgeting" | "health"

function isTutorialPathId(value: unknown): value is TutorialPathId {
  return value === "cooking" || value === "budgeting" || value === "health"
}

function isRankedGoals(value: unknown): value is RankedGoals {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 3 &&
    value.every(isTutorialPathId)
  )
}

export interface FlatTutorialSlot {
  page: string
  step: TutorialStep | GeneralPageEntry
  substep: TutorialSubstep
  /** null for general orientation slots */
  tutorialId: TutorialPathId | null
  /** null for general orientation slots */
  rank: GoalRank | null
  isGeneral: boolean
}

/**
 * Returns true if the current pathname matches a step's page.
 * Supports wildcard suffix: "/recipes/*" matches any "/recipes/[anything]" URL.
 */
export function pageMatches(stepPage: string, pathname: string): boolean {
  if (stepPage.endsWith("*")) {
    return pathname.startsWith(stepPage.slice(0, -1))
  }
  return pathname === stepPage
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

/**
 * Builds the flat sequence of tutorial slots organized by page.
 * For each page: general orientation substeps first (same for everyone),
 * then ranked tutorial substeps in order (rank 1 gets more depth than rank 2/3).
 */
function buildFlatSequence(rankedGoals: RankedGoals): FlatTutorialSlot[] {
  // Derive canonical page order from the first ranked path
  const firstPath = tutorialPaths[rankedGoals[0]]
  const pages = firstPath.steps.map(s => s.page)
  const generalByPage = Object.fromEntries(generalPages.map(g => [g.page, g]))
  const slots: FlatTutorialSlot[] = []

  for (const page of pages) {
    // 1. General orientation substeps — shown regardless of tutorial order
    const general = generalByPage[page]
    if (general) {
      for (const substep of general.substeps) {
        slots.push({ page, step: general, substep, tutorialId: null, rank: null, isGeneral: true })
      }
    }

    // 2. Ranked tutorial substeps — ordered by rank, depth proportional to rank
    for (let rankIdx = 0; rankIdx < rankedGoals.length; rankIdx++) {
      const tutorialId = rankedGoals[rankIdx] as TutorialPathId
      const rank = Math.min(rankIdx + 1, 3) as GoalRank
      const path = tutorialPaths[tutorialId]
      const step = path.steps.find(s => s.page === page)
      if (!step) continue
      const substeps = getVisibleSubsteps(step, rank)
      for (const substep of substeps) {
        slots.push({ page, step, substep, tutorialId, rank, isGeneral: false })
      }
    }

    // 3. Post-ranked general substeps — appended after all ranked substeps
    if (general?.postSubsteps) {
      for (const substep of general.postSubsteps) {
        slots.push({ page, step: general, substep, tutorialId: null, rank: null, isGeneral: true })
      }
    }
  }

  return slots
}

interface TutorialContextType {
  isActive: boolean
  rankedGoals: RankedGoals | null
  flatSequence: FlatTutorialSlot[]
  currentSlotIndex: number
  currentSlot: FlatTutorialSlot | null
  currentStep: TutorialStep | GeneralPageEntry | null
  currentSubstep: TutorialSubstep | null

  tutorialCompleted: boolean
  tutorialPath: TutorialPathId | null
  tutorialCompletedAt: string | null

  startRankedSession: (ranked: RankedGoals) => void
  startTutorial: (pathId: TutorialPathId) => void
  nextStep: () => void
  prevStep: () => void
  skipTutorial: () => void
  resetTutorial: () => void
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
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0)
  const [tutorialCompleted, setTutorialCompleted] = useState(false)
  const [tutorialPath, setTutorialPath] = useState<TutorialPathId | null>(null)
  const [tutorialCompletedAt, setTutorialCompletedAt] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, updateProfile } = useAuth()
  const { trackEvent } = useAnalytics()
  const DISMISS_KEY = "tutorial_dismissed_v1"
  const TUTORIAL_STATE_KEY = "tutorial_state_v1"
  // Bump this when the payload shape changes; old payloads will be silently discarded
  const TUTORIAL_STATE_VERSION = 4

  // Derived state
  const flatSequence = rankedGoals ? buildFlatSequence(rankedGoals) : []
  const currentSlot = flatSequence[currentSlotIndex] ?? null
  const currentStep = currentSlot?.step ?? null
  const currentSubstep = currentSlot?.substep ?? null

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
        currentSlotIndex,
      })
    )
  }, [rankedGoals, currentSlotIndex, isActive])

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

        const goals = state.rankedGoals as RankedGoals
        const sequence = buildFlatSequence(goals)
        setRankedGoals(goals)
        setCurrentSlotIndex(
          Number.isInteger(state.currentSlotIndex)
            ? Math.min(state.currentSlotIndex, sequence.length - 1)
            : 0
        )
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
    }
    const sequence = buildFlatSequence(ranked)
    setRankedGoals(ranked)
    setCurrentSlotIndex(0)
    setIsActive(true)
    trackEvent("tutorial_started", { path: ranked[0] })
    if (sequence.length > 0) {
      router.push(sequence[0].page)
    }
  }, [trackEvent, router])

  const startTutorial = useCallback((pathId: TutorialPathId) => {
    startRankedSession([pathId])
  }, [startRankedSession])

  const completeTutorial = useCallback(async () => {
    if (!user || !rankedGoals) return
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
      setTutorialCompleted(true)
      setTutorialPath(rankedGoals[0])
      setTutorialCompletedAt(completedAt)

      trackEvent("tutorial_completed", {
        path: rankedGoals[0],
        steps_completed: flatSequence.length,
      })
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, rankedGoals, updateProfile, flatSequence, trackEvent])

  // -------------------
  // Navigation Functions
  // -------------------

  const nextStep = useCallback(() => {
    if (flatSequence.length === 0) return

    if (currentSlotIndex < flatSequence.length - 1) {
      const nextIndex = currentSlotIndex + 1
      const nextSlot = flatSequence[nextIndex]
      const currentPage = flatSequence[currentSlotIndex].page

      const completedSlot = flatSequence[currentSlotIndex]
      if (completedSlot.tutorialId) {
        trackEvent("tutorial_step_completed", {
          path: completedSlot.tutorialId,
          step_index: currentSlotIndex,
        })
      }

      if (nextSlot.page !== currentPage && !nextSlot.page.endsWith("*")) {
        router.push(nextSlot.page)
      }

      setCurrentSlotIndex(nextIndex)
    } else {
      completeTutorial()
    }
  }, [flatSequence, currentSlotIndex, trackEvent, completeTutorial, router])

  const prevStep = useCallback(() => {
    if (currentSlotIndex <= 0) return

    // Walk backwards to find the target index, skipping wildcard pages that we
    // can't navigate back to (we don't store the original dynamic URL the user
    // visited, so "/recipes/*" is unreachable from a different page).
    let prevIndex = currentSlotIndex - 1
    while (prevIndex > 0) {
      const slot = flatSequence[prevIndex]
      if (!slot.page.endsWith("*") || pageMatches(slot.page, pathname)) break
      prevIndex--
    }

    const prevSlot = flatSequence[prevIndex]

    // Only navigate if the browser isn't already on a matching page.
    // Use pageMatches (not strict equality) so wildcard pages work correctly.
    if (!pageMatches(prevSlot.page, pathname)) {
      router.push(prevSlot.page)
    }

    setCurrentSlotIndex(prevIndex)
  }, [currentSlotIndex, flatSequence, pathname, router])

  const skipTutorial = useCallback(async () => {
    if (!user) return
    try {
      if (currentSlot?.tutorialId) {
        trackEvent("tutorial_skipped", {
          path: currentSlot.tutorialId,
          step_abandoned: currentSlotIndex,
        })
      }

      setIsActive(false)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DISMISS_KEY, "1")
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    } catch (error) {
      console.error("Error skipping tutorial:", error)
    }
  }, [user, currentSlot, currentSlotIndex, trackEvent])

  const resetTutorial = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
    }
    setIsActive(false)
    setRankedGoals(null)
    setCurrentSlotIndex(0)
  }, [])

  // -------------------
  // Effects
  // -------------------

  useEffect(() => {
    restoreTutorialState()
  }, [restoreTutorialState])

  useEffect(() => {
    saveTutorialState()
  }, [rankedGoals, currentSlotIndex, isActive, saveTutorialState])

  useEffect(() => {
    if (flatSequence.length === 0) {
      if (currentSlotIndex !== 0) {
        setCurrentSlotIndex(0)
      }
      return
    }

    if (currentSlotIndex > flatSequence.length - 1) {
      setCurrentSlotIndex(flatSequence.length - 1)
    }
  }, [flatSequence, currentSlotIndex])

  useEffect(() => {
    if (!profile) return
    setTutorialCompleted(profile.tutorial_completed === true)
    setTutorialCompletedAt(profile.tutorial_completed_at ?? null)
    setTutorialPath(isTutorialPathId(profile.tutorial_path) ? profile.tutorial_path : null)

    if (profile.tutorial_completed === true) {
      setIsActive(false)
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    }
  }, [profile])

  useEffect(() => {
    setTutorialToastSuppression(isActive)
    return () => setTutorialToastSuppression(false)
  }, [isActive])

  // -------------------
  // Context Value
  // -------------------

  const value: TutorialContextType = {
    isActive,
    rankedGoals,
    flatSequence,
    currentSlotIndex,
    currentSlot,
    currentStep,
    currentSubstep,
    tutorialCompleted,
    tutorialPath,
    tutorialCompletedAt,
    startRankedSession,
    startTutorial,
    nextStep,
    prevStep,
    skipTutorial,
    resetTutorial,
  }

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}
