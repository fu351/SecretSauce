"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "./auth-context"
import { useIsMobile } from "@/hooks/ui/use-mobile"
import { useAnalytics } from "@/hooks/use-analytics"
import { setTutorialToastSuppression } from "@/hooks/ui/use-toast"

import type {
  TutorialSubstep,
  GeneralPageEntry,
} from "../contents/tutorial-content"

import { generalPages } from "../contents/tutorial-content"

export interface FlatTutorialSlot {
  page: string
  step: GeneralPageEntry
  substep: TutorialSubstep
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

function isSubstepVisibleOnDevice(substep: TutorialSubstep, isMobile: boolean) {
  if (substep.mobileOnly && !isMobile) return false
  if (substep.desktopOnly && isMobile) return false
  return true
}

/**
 * Builds the flat sequence from the shared general walkthrough.
 * Each page is shown in a single canonical order so the tour reads top-to-bottom
 * within a page and only jumps when transitioning to a new page.
 */
function buildFlatSequence(isMobile: boolean): FlatTutorialSlot[] {
  const slots: FlatTutorialSlot[] = []

  for (const general of generalPages) {
    const page = general.page

    for (const substep of general.steps.filter((candidate) => isSubstepVisibleOnDevice(candidate, isMobile))) {
      slots.push({ page, step: general, substep })
    }
  }

  return slots
}

interface TutorialContextType {
  isActive: boolean
  flatSequence: FlatTutorialSlot[]
  currentSlotIndex: number
  currentSlot: FlatTutorialSlot | null
  currentStep: GeneralPageEntry | null
  currentSubstep: TutorialSubstep | null

  tutorialCompleted: boolean
  tutorialCompletedAt: string | null

  startTutorial: () => void
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
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0)
  const [tutorialCompleted, setTutorialCompleted] = useState(false)
  const [tutorialCompletedAt, setTutorialCompletedAt] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, updateProfile } = useAuth()
  const isMobile = useIsMobile()
  const { trackEvent } = useAnalytics()
  const DISMISS_KEY = "tutorial_dismissed_v1"
  const TUTORIAL_STATE_KEY = "tutorial_state_v1"
  // Bump this when the payload shape changes; old payloads will be silently discarded
  const TUTORIAL_STATE_VERSION = 10

  // Derived state
  const flatSequence = useMemo(() => buildFlatSequence(isMobile), [isMobile])
  const currentSlot = flatSequence[currentSlotIndex] ?? null
  const currentStep = currentSlot?.step ?? null
  const currentSubstep = currentSlot?.substep ?? null

  // Save tutorial state to localStorage
  const saveTutorialState = useCallback(() => {
    if (typeof window === "undefined") return

    if (!isActive) {
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      return
    }

    window.localStorage.setItem(
      TUTORIAL_STATE_KEY,
      JSON.stringify({
        version: TUTORIAL_STATE_VERSION,
        currentSlotIndex,
      })
    )
  }, [currentSlotIndex, isActive])

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
        const sequence = buildFlatSequence(window.innerWidth < 768)
        const restoredIndex = Number.isInteger(state.currentSlotIndex)
          ? Math.min(state.currentSlotIndex, sequence.length - 1)
          : 0
        setCurrentSlotIndex(restoredIndex)
        setIsActive(true)
        trackEvent("tutorial_restored", { step_index: restoredIndex })
      } catch (e) {
        console.error("Failed to restore tutorial state:", e)
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    }
  }, [trackEvent])

  // -------------------
  // Core Functions
  // -------------------

  const startTutorial = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
    }
    const sequence = buildFlatSequence(isMobile)
    setCurrentSlotIndex(0)
    setIsActive(true)
    trackEvent("tutorial_started", { steps_total: sequence.length })
    if (sequence.length > 0) {
      router.push(sequence[0].page)
    }
  }, [isMobile, trackEvent, router])

  const completeTutorial = useCallback(async () => {
    if (!user) return
    const completedAt = new Date().toISOString()

    setIsActive(false)
    setTutorialCompleted(true)
    setTutorialCompletedAt(completedAt)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      window.localStorage.removeItem(DISMISS_KEY)
    }

    try {
      await updateProfile({
        tutorial_completed: true,
        tutorial_completed_at: completedAt,
      })
      trackEvent("tutorial_completed", {
        steps_completed: flatSequence.length,
      })
    } catch (error) {
      console.error("Error completing tutorial:", error)
    }
  }, [user, updateProfile, flatSequence, trackEvent])

  // -------------------
  // Navigation Functions
  // -------------------

  const nextStep = useCallback(() => {
    if (flatSequence.length === 0) return

    if (currentSlotIndex < flatSequence.length - 1) {
      const nextIndex = currentSlotIndex + 1
      const nextSlot = flatSequence[nextIndex]
      const currentPage = flatSequence[currentSlotIndex].page

      trackEvent("tutorial_step_completed", {
        step_index: currentSlotIndex,
      })

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

    let prevIndex = currentSlotIndex - 1
    while (prevIndex > 0) {
      const slot = flatSequence[prevIndex]
      if (!slot.page.endsWith("*") || pageMatches(slot.page, pathname)) break
      prevIndex--
    }

    const prevSlot = flatSequence[prevIndex]

    trackEvent("tutorial_back_step", { from_step_index: currentSlotIndex, to_step_index: prevIndex })

    if (!pageMatches(prevSlot.page, pathname)) {
      router.push(prevSlot.page)
    }

    setCurrentSlotIndex(prevIndex)
  }, [currentSlotIndex, flatSequence, pathname, router, trackEvent])

  const skipTutorial = useCallback(async () => {
    try {
      trackEvent("tutorial_skipped", {
        step_abandoned: currentSlotIndex,
      })

      setIsActive(false)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DISMISS_KEY, "1")
        window.localStorage.removeItem(TUTORIAL_STATE_KEY)
      }
    } catch (error) {
      console.error("Error skipping tutorial:", error)
    }
  }, [currentSlotIndex, trackEvent])

  const resetTutorial = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DISMISS_KEY)
      window.localStorage.removeItem(TUTORIAL_STATE_KEY)
    }
    setIsActive(false)
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
  }, [currentSlotIndex, isActive, saveTutorialState])

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

    if (profile.tutorial_completed === true) {
      // Respect an in-progress session (e.g. rewatch from Settings, or a test
      // that seeded localStorage state). Only deactivate when there is no
      // active localStorage state; otherwise the user's explicit restart gets
      // silently cancelled the moment the profile response arrives.
      const hasLocalState =
        typeof window !== "undefined" &&
        !!window.localStorage.getItem(TUTORIAL_STATE_KEY)
      if (!hasLocalState) {
        setIsActive(false)
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
    flatSequence,
    currentSlotIndex,
    currentSlot,
    currentStep,
    currentSubstep,
    tutorialCompleted,
    tutorialCompletedAt,
    startTutorial,
    nextStep,
    prevStep,
    skipTutorial,
    resetTutorial,
  }

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
}
