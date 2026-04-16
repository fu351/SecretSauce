"use client"

import { useEffect } from "react"
import type { FlatTutorialSlot } from "@/contexts/tutorial-context"
import { pageMatches } from "@/contexts/tutorial-context"
import type { TutorialSubstep } from "@/lib/types/ui/tutorial"

interface UseAutoAdvanceOptions {
  isActive: boolean
  isPageTransition: boolean
  isMandatoryCompleted: boolean
  currentSlot: FlatTutorialSlot | null
  nextSlot: FlatTutorialSlot | null
  currentSubstep: TutorialSubstep | null | undefined
  pathname: string
  nextStep: () => void
}

export function useAutoAdvance({
  isActive,
  isPageTransition,
  isMandatoryCompleted,
  currentSlot,
  nextSlot,
  currentSubstep,
  pathname,
  nextStep,
}: UseAutoAdvanceOptions) {
  /**
   * Effect 6 — auto-advance when the user navigates to the next page via the
   * highlighted nav link.
   */
  useEffect(() => {
    if (!isPageTransition || !nextSlot) return
    if (pageMatches(nextSlot.page, pathname)) {
      nextStep()
    }
  }, [isPageTransition, nextSlot, pathname, nextStep])

  /**
   * Effect 6b — auto-advance after an in-page mandatory action (same-page,
   * non-wildcard). Page-transition and wildcard cases handled by 6 and 6c.
   */
  useEffect(() => {
    if (!isMandatoryCompleted || !nextSlot || !currentSlot) return
    if (!currentSubstep?.mandatory) return
    if (isPageTransition) return
    if (nextSlot.page !== currentSlot.page) return
    nextStep()
  }, [isMandatoryCompleted, isPageTransition, nextSlot, currentSlot, currentSubstep, nextStep])

  /**
   * Effect 6c — auto-advance when a mandatory click navigates to a wildcard
   * next page. Only fires while still on the source page.
   */
  useEffect(() => {
    if (!isMandatoryCompleted || !nextSlot || !currentSlot) return
    if (nextSlot.page === currentSlot.page) return
    if (!nextSlot.page.endsWith("*")) return
    if (
      !pageMatches(currentSlot.page, pathname) &&
      pageMatches(nextSlot.page, pathname)
    ) {
      nextStep()
    }
  }, [isMandatoryCompleted, nextSlot, currentSlot, pathname, nextStep])

  /**
   * Effect 6d — auto-complete when the last step highlights a nav link and the
   * user navigates to that destination. nextSlot is null at the last step so
   * none of the earlier effects apply.
   */
  useEffect(() => {
    if (!isActive || nextSlot !== null) return
    if (!currentSubstep?.highlightSelector) return
    const navMatch = currentSubstep.highlightSelector.match(
      /^\[data-tutorial-nav='(.+?)'\]$/
    )
    if (!navMatch) return
    if (pathname === navMatch[1]) {
      nextStep()
    }
  }, [isActive, nextSlot, currentSubstep, pathname, nextStep])
}
