"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { TutorialStep, TutorialSubstep, GeneralPageEntry } from "@/lib/types/ui/tutorial"
import {
  MAX_RETRIES,
  SCROLL_HIGHLIGHT_INTERVAL,
  isHTMLElement,
  findFirstVisibleElement,
  resolveScrollContainer,
  isMealPlannerLayoutTransitionElement,
  isScrollableElement,
  isRectClippedByContainer,
} from "@/lib/tutorial-utils"
import {
  isTutorialHighlightSuppressed,
  _registerHighlightReleaseCallback,
} from "@/lib/tutorial-highlight-suppression"
import { useStateWithRef } from "./use-state-with-ref"

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

interface UseHighlightEngineOptions {
  isActive: boolean
  currentStep: TutorialStep | GeneralPageEntry | null | undefined
  currentSubstep: TutorialSubstep | null | undefined
  currentSlotIndex: number
  transitionNavSelector: string | null
  expectedScrollContainerSelector: string | null | undefined
  isMinimized: boolean
  isPageLoading: boolean
  scrollToTarget: (
    element: HTMLElement,
    scrollContainer?: HTMLElement | null,
    options?: { force?: boolean }
  ) => Promise<void>
  setIsChangingPage: (value: boolean) => void
  pathname: string
}

export function useHighlightEngine({
  isActive,
  currentStep,
  currentSubstep,
  currentSlotIndex,
  transitionNavSelector,
  expectedScrollContainerSelector,
  isMinimized,
  isPageLoading,
  scrollToTarget,
  setIsChangingPage,
  pathname,
}: UseHighlightEngineOptions) {
  const [syncRetries, setSyncRetries] = useState(0)
  const [hasSyncTimedOut, setHasSyncTimedOut] = useState(false)
  const [targetElement, targetElementRef, setTargetElement] =
    useStateWithRef<HTMLElement | null>(null)
  const [targetRect, targetRectRef, setTargetRect] =
    useStateWithRef<DOMRect | null>(null)
  const [activeScrollContainer, activeScrollContainerRef, setActiveScrollContainer] =
    useStateWithRef<HTMLElement | null>(null)

  const highlightFrameRef = useRef<number | null>(null)
  const highlightTimerRef = useRef<number | null>(null)
  const lastHighlightRunAtRef = useRef(0)
  const updateHighlightRef = useRef<() => void>(() => {})
  const autoScrollKeyRef = useRef<string | null>(null)
  const pendingNextAutoScrollRef = useRef(false)
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null)

  const clearScheduledHighlightUpdate = useCallback(() => {
    if (typeof window === "undefined") return

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }
    if (highlightFrameRef.current !== null) {
      window.cancelAnimationFrame(highlightFrameRef.current)
      highlightFrameRef.current = null
    }
  }, [])

  const scheduleHighlightUpdate = useCallback(
    (options?: { immediate?: boolean; minIntervalMs?: number }) => {
      if (typeof window === "undefined") return

      const shouldRunImmediately = options?.immediate === true
      const minIntervalMs = options?.minIntervalMs ?? 0

      if (shouldRunImmediately) {
        clearScheduledHighlightUpdate()
        lastHighlightRunAtRef.current = Date.now()
        updateHighlightRef.current()
        return
      }

      if (
        highlightTimerRef.current !== null ||
        highlightFrameRef.current !== null
      ) {
        return
      }

      const elapsed = Date.now() - lastHighlightRunAtRef.current
      const waitMs = Math.max(0, minIntervalMs - elapsed)

      const queueFrame = () => {
        highlightFrameRef.current = window.requestAnimationFrame(() => {
          highlightFrameRef.current = null
          lastHighlightRunAtRef.current = Date.now()
          updateHighlightRef.current()
        })
      }

      if (waitMs > 0) {
        highlightTimerRef.current = window.setTimeout(() => {
          highlightTimerRef.current = null
          queueFrame()
        }, waitMs)
        return
      }

      queueFrame()
    },
    [clearScheduledHighlightUpdate]
  )

  // Cleanup timers on unmount
  useEffect(() => clearScheduledHighlightUpdate, [clearScheduledHighlightUpdate])

  const updateHighlight = useCallback(() => {
    if (!isActive || !currentStep || isMinimized || isPageLoading) return
    if (isTutorialHighlightSuppressed()) return

    const stepSel =
      currentStep && "highlightSelector" in currentStep
        ? currentStep.highlightSelector
        : undefined
    const selector =
      transitionNavSelector ?? currentSubstep?.highlightSelector ?? stepSel

    if (!selector) {
      setTargetElement(null)
      setTargetRect(null)
      setActiveScrollContainer(null)
      setIsChangingPage(false)
      return
    }

    const element = findFirstVisibleElement(selector)

    if (!element) {
      if (syncRetries < MAX_RETRIES && !isPageLoading) {
        const delayMs = Math.min(300 * Math.pow(1.8, syncRetries), 8000)
        const retryTimer = setTimeout(() => {
          setSyncRetries((prev: number) => prev + 1)
          updateHighlight()
        }, delayMs)
        return () => clearTimeout(retryTimer)
      } else if (!isPageLoading) {
        setHasSyncTimedOut(true)
        setIsChangingPage(false)
        return
      }
      return
    }

    setIsChangingPage(false)
    setHasSyncTimedOut(false)
    setSyncRetries(0)

    const scrollContainer = resolveScrollContainer(
      element,
      expectedScrollContainerSelector
    )

    // Wait for any running CSS animations before locking the rect
    let animEl: Element | null = element
    while (animEl && animEl !== document.documentElement) {
      const running = animEl.getAnimations().filter((a) => a.playState === "running")
      if (running.length > 0) {
        Promise.all(running.map((a) => a.finished.catch(() => {}))).then(() => {
          scheduleHighlightUpdate({ immediate: true })
        })
        return
      }
      animEl = animEl.parentElement
    }

    // Wait for meal planner layout transition to settle
    const mealPlannerLayoutElement = document.querySelector(
      "[data-tutorial='planner-sidebar-shell']"
    )
    if (
      isHTMLElement(mealPlannerLayoutElement) &&
      isMealPlannerLayoutTransitionElement(mealPlannerLayoutElement, pathname)
    ) {
      const runningLayoutAnimations = mealPlannerLayoutElement
        .getAnimations()
        .filter((animation) => animation.playState === "running")

      if (runningLayoutAnimations.length > 0) {
        Promise.all(
          runningLayoutAnimations.map((animation) =>
            animation.finished.catch(() => {})
          )
        ).then(() => {
          scheduleHighlightUpdate({ immediate: true })
        })
        return
      }
    }

    const newRect = element.getBoundingClientRect()
    const containerRect = scrollContainer?.getBoundingClientRect() ?? null
    const needsContainerScroll =
      !!scrollContainer &&
      isScrollableElement(scrollContainer) &&
      !!containerRect &&
      isRectClippedByContainer(newRect, containerRect)

    const autoScrollKey = `${currentSlotIndex}:${selector}:${expectedScrollContainerSelector ?? ""}`
    const shouldAutoScrollForNext =
      pendingNextAutoScrollRef.current &&
      autoScrollKeyRef.current !== autoScrollKey

    if (
      (needsContainerScroll || shouldAutoScrollForNext) &&
      autoScrollKeyRef.current !== autoScrollKey
    ) {
      autoScrollKeyRef.current = autoScrollKey
      scrollToTarget(element, scrollContainer, {
        force: shouldAutoScrollForNext,
      })
      pendingNextAutoScrollRef.current = false
    }

    setTargetElement(element)
    setActiveScrollContainer(scrollContainer)

    const prev = targetRectRef.current
    const hasMoved =
      !prev ||
      Math.abs(newRect.top - prev.top) > 2 ||
      Math.abs(newRect.left - prev.left) > 2

    if (hasMoved) {
      setTargetRect(newRect)
    }
  }, [
    isActive,
    currentStep,
    currentSubstep,
    currentSlotIndex,
    expectedScrollContainerSelector,
    isMinimized,
    isPageLoading,
    scrollToTarget,
    syncRetries,
    setSyncRetries,
    setHasSyncTimedOut,
    setIsChangingPage,
    transitionNavSelector,
    pathname,
    scheduleHighlightUpdate,
    setTargetElement,
    setTargetRect,
    setActiveScrollContainer,
    targetRectRef,
  ])

  // Keep a stable ref so delayed callbacks call the latest version
  useEffect(() => {
    updateHighlightRef.current = updateHighlight
  }, [updateHighlight])

  // Register release callback so suppression auto-triggers a re-run on release
  useEffect(() => {
    _registerHighlightReleaseCallback(() =>
      scheduleHighlightUpdate({ immediate: true })
    )
    return () => _registerHighlightReleaseCallback(() => {})
  }, [scheduleHighlightUpdate])

  // Kick off highlight on slot/substep change
  useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(
      () => scheduleHighlightUpdate({ immediate: true }),
      150
    )
    return () => clearTimeout(timer)
  }, [isActive, currentSlotIndex, currentSubstep?.id, scheduleHighlightUpdate])

  // Re-trigger when page loading clears
  useEffect(() => {
    if (!isActive || isPageLoading) return
    scheduleHighlightUpdate({ immediate: true })
  }, [isActive, isPageLoading, scheduleHighlightUpdate])

  // Re-run when mandatory step flips isPageTransition (new nav-link selector)
  // Callers pass this flag in; we expose a "retrigger" fn they call from their effect.
  const retriggerHighlight = useCallback(() => {
    scheduleHighlightUpdate({ immediate: true })
  }, [scheduleHighlightUpdate])

  // Listen for scroll on the active container
  useEffect(() => {
    if (!isActive || !activeScrollContainer) return

    const handleScroll = () =>
      scheduleHighlightUpdate({ minIntervalMs: SCROLL_HIGHLIGHT_INTERVAL })
    activeScrollContainer.addEventListener("scroll", handleScroll, {
      passive: true,
    })
    return () => activeScrollContainer.removeEventListener("scroll", handleScroll)
  }, [isActive, activeScrollContainer, scheduleHighlightUpdate])

  // Listen for meal planner layout transition settle
  useEffect(() => {
    if (!isActive || pathname !== "/meal-planner") return

    const sidebarShell = document.querySelector(
      "[data-tutorial='planner-sidebar-shell']"
    )
    if (!isHTMLElement(sidebarShell)) return

    const handleLayoutSettled = (event: TransitionEvent) => {
      if (event.target !== sidebarShell || event.propertyName !== "width")
        return
      scheduleHighlightUpdate({ immediate: true })
    }

    sidebarShell.addEventListener("transitionend", handleLayoutSettled)
    sidebarShell.addEventListener("transitioncancel", handleLayoutSettled)
    return () => {
      sidebarShell.removeEventListener("transitionend", handleLayoutSettled)
      sidebarShell.removeEventListener("transitioncancel", handleLayoutSettled)
    }
  }, [isActive, pathname, scheduleHighlightUpdate])

  // MutationObserver + resize + scroll on window
  useIsomorphicLayoutEffect(() => {
    if (!isActive || isMinimized) return

    let lastMutationTime = Date.now()
    let lastHighlightAttempt = 0
    const DEBOUNCE_INTERVAL = 150
    const MIN_HIGHLIGHT_INTERVAL = 500

    const observer = new MutationObserver((mutations) => {
      const isInternal = mutations.every((m) =>
        // overlayRef is owned by the overlay — skip mutations originating inside it.
        // We don't have a ref here, so we check for the data attribute instead.
        (m.target as HTMLElement).closest?.("[data-tutorial-overlay]") !== null
      )
      if (isInternal) return
      if (isTutorialHighlightSuppressed()) return

      const now = Date.now()
      if (now - lastHighlightAttempt < MIN_HIGHLIGHT_INTERVAL) return
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current)

      const timeSinceLastMutation = now - lastMutationTime
      const delay = Math.max(0, DEBOUNCE_INTERVAL - timeSinceLastMutation)

      stabilityTimerRef.current = setTimeout(() => {
        lastHighlightAttempt = Date.now()
        scheduleHighlightUpdate({ immediate: true })
        lastMutationTime = Date.now()
      }, delay)
    })

    observer.observe(document.body, { childList: true, subtree: true })

    const handleResize = () => scheduleHighlightUpdate({ immediate: true })
    const handleWindowScroll = () =>
      scheduleHighlightUpdate({ minIntervalMs: SCROLL_HIGHLIGHT_INTERVAL })

    window.addEventListener("resize", handleResize)
    window.addEventListener("scroll", handleWindowScroll, {
      capture: true,
      passive: true,
    })

    if (Date.now() - lastHighlightAttempt > MIN_HIGHLIGHT_INTERVAL) {
      lastHighlightAttempt = Date.now()
      scheduleHighlightUpdate({ immediate: true })
    }

    return () => {
      observer.disconnect()
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("scroll", handleWindowScroll, true)
    }
  }, [isActive, isMinimized, currentSlotIndex, pathname, currentStep?.page, scheduleHighlightUpdate])

  // Reset retry state on slot change
  useEffect(() => {
    if (!isActive) return
    setSyncRetries(0)
    setHasSyncTimedOut(false)
  }, [isActive, currentSlotIndex])

  return {
    targetElement,
    targetElementRef,
    targetRect,
    targetRectRef,
    activeScrollContainer,
    activeScrollContainerRef,
    setTargetElement,
    setTargetRect,
    setActiveScrollContainer,
    scheduleHighlightUpdate,
    clearScheduledHighlightUpdate,
    pendingNextAutoScrollRef,
    autoScrollKeyRef,
    retriggerHighlight,
    syncRetries,
    hasSyncTimedOut,
  }
}
