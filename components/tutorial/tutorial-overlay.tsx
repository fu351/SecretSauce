"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial, pageMatches } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, Lightbulb, Loader2, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/ui/use-toast"
import clsx from "clsx"
import { useIsMobile } from "@/hooks"

import { useScrollToTarget } from "@/hooks/tutorial/use-scroll-to-target"
import { useHighlightEngine } from "@/hooks/tutorial/use-highlight-engine"
import { useMandatoryCompletion } from "@/hooks/tutorial/use-mandatory-completion"
import { useAutoAdvance } from "@/hooks/tutorial/use-auto-advance"
import { useOverlayDrag } from "@/hooks/tutorial/use-overlay-drag"
import { TutorialBackdrop } from "./tutorial-backdrop"
import { TutorialCardBody } from "./tutorial-card-body"
import {
  isRectWithinHeader,
  CONTAINER_SCROLL_PADDING,
  WINDOW_SCROLL_PADDING,
  DASHBOARD_AUTO_SCROLL_SELECTORS,
} from "@/lib/tutorial-utils"

declare global {
  interface Window {
    __TUTORIAL_DEBUG_SCROLL__?: boolean
  }
}

export function TutorialOverlay() {
  const {
    isActive,
    flatSequence,
    currentSlotIndex,
    currentSlot,
    currentStep,
    currentSubstep,
    nextStep,
    prevStep,
    skipTutorial,
  } = useTutorial()
  const { toast } = useToast()
  const { theme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useIsMobile()
  const isDark = theme === "dark"

  // ─── Local UI state ─────────────────────────────────────────────────────────

  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [isChangingPage, setIsChangingPage] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const lastPathnameRef = useRef(pathname)

  // ─── Derived sequence values ─────────────────────────────────────────────────

  const totalSteps = flatSequence.length
  const completedSteps = currentSlotIndex + 1
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  const isLastStep = currentSlotIndex === totalSteps - 1

  const stepHighlightSelector =
    currentStep && "highlightSelector" in currentStep
      ? currentStep.highlightSelector
      : undefined
  const stepScrollContainerSelector =
    currentStep && "scrollContainerSelector" in currentStep
      ? currentStep.scrollContainerSelector
      : undefined
  const nextSlot =
    currentSlotIndex < flatSequence.length - 1
      ? flatSequence[currentSlotIndex + 1]
      : null

  const completionSelector = currentSubstep?.completionSelector ?? null

  // Substep-level selector, used by the mandatory completion hook.
  // transitionNavSelector is computed after isMandatoryCompleted is known.
  const substepExpectedSelector =
    currentSubstep?.highlightSelector ?? stepHighlightSelector ?? null

  const expectedScrollContainerSelector =
    currentSubstep?.scrollContainerSelector ??
    stepScrollContainerSelector ??
    null

  const nextStepHighlightSelector =
    nextSlot?.substep.highlightSelector ??
    (nextSlot?.step && "highlightSelector" in nextSlot.step
      ? nextSlot.step.highlightSelector
      : undefined) ??
    null

  const nextStepScrollContainerSelector =
    nextSlot?.substep.scrollContainerSelector ??
    (nextSlot?.step && "scrollContainerSelector" in nextSlot.step
      ? nextSlot.step.scrollContainerSelector
      : undefined) ??
    null

  const shouldAutoScrollDashboardNextWithinPage =
    !!nextSlot &&
    !!currentSlot &&
    nextSlot.page === currentSlot.page &&
    currentSlot.page === "/dashboard" &&
    !!nextStepHighlightSelector &&
    DASHBOARD_AUTO_SCROLL_SELECTORS.has(nextStepHighlightSelector)

  const shouldAutoScrollNextWithinPage =
    !!nextSlot &&
    !!currentSlot &&
    nextSlot.page === currentSlot.page &&
    (!!nextStepScrollContainerSelector ||
      currentSlot.page === "/recipes/*" ||
      shouldAutoScrollDashboardNextWithinPage)

  // ─── Effect 0a: mark body for CSS compensation ───────────────────────────────

  useEffect(() => {
    if (isActive) {
      document.body.setAttribute("data-tutorial-active", "true")
    } else {
      document.body.removeAttribute("data-tutorial-active")
    }
    return () => document.body.removeAttribute("data-tutorial-active")
  }, [isActive])

  // ─── Effect 0: header height ─────────────────────────────────────────────────

  useEffect(() => {
    const detectHeaderHeight = () => {
      const header = document.querySelector("header")
      if (header) setHeaderHeight(header.offsetHeight)
    }
    detectHeaderHeight()
    window.addEventListener("resize", detectHeaderHeight)
    return () => window.removeEventListener("resize", detectHeaderHeight)
  }, [])

  // ─── Effect 2: page-loading detector ─────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return

    const detectPageLoading = () => {
      const getAllWithClass = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).filter(
          (el) => !overlayRef.current?.contains(el)
        )
      const hasLoadingSpinner =
        getAllWithClass('[class*="animate-spin"]').length > 0
      const hasSkeletonLoader =
        getAllWithClass('[class*="animate-pulse"]').length > 0
      const hasLoadingClass =
        getAllWithClass('[class*="loading"]').length > 0
      setIsPageLoading(!!(hasLoadingSpinner || hasSkeletonLoader || hasLoadingClass))
    }

    detectPageLoading()

    let debounceTimer: NodeJS.Timeout | null = null
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(detectPageLoading, 150)
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [isActive])

  // ─── Effect 2b: reset UI state on tutorial activation ────────────────────────

  useEffect(() => {
    if (!isActive) return
    setShowSkipConfirmation(false)
    setIsMinimized(false)
    if (currentStep?.page && !pageMatches(currentStep.page, pathname)) {
      setIsChangingPage(true)
    }
    setIsPageLoading(false)
  }, [isActive, currentStep?.page, pathname])

  // ─── Effect 2c: reset on slot change ─────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return
    // Don't reset isChangingPage here — it's managed by the page nav effect.
    setIsPageLoading(false)
  }, [isActive, currentSlotIndex])

  // ─── Effect: scroll to top on page nav ───────────────────────────────────────

  useEffect(() => {
    const previousPathname = lastPathnameRef.current
    lastPathnameRef.current = pathname

    if (!isActive || !currentStep) return
    if (previousPathname === pathname) return
    if (!pageMatches(currentStep.page, pathname)) return

    window.scrollTo({ top: 0, left: 0, behavior: "auto" })

    let frameId: number | null = null
    let nestedFrameId: number | null = null
    frameId = window.requestAnimationFrame(() => {
      const pageScrollRoot = document.querySelector(
        "[data-tutorial-scroll-root='page']"
      )
      if (pageScrollRoot instanceof HTMLElement) {
        pageScrollRoot.scrollTo({ top: 0, left: 0, behavior: "auto" })
      }
      nestedFrameId = window.requestAnimationFrame(() => {
        const latestPageScrollRoot = document.querySelector(
          "[data-tutorial-scroll-root='page']"
        )
        if (latestPageScrollRoot instanceof HTMLElement) {
          latestPageScrollRoot.scrollTo({ top: 0, left: 0, behavior: "auto" })
        }
      })
    })

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (nestedFrameId !== null) window.cancelAnimationFrame(nestedFrameId)
    }
  }, [isActive, currentStep, pathname])

  // ─── Effect 3: page navigation state ─────────────────────────────────────────

  useEffect(() => {
    if (!isActive || !currentStep) return
    if (!pageMatches(currentStep.page, pathname)) {
      setIsChangingPage(true)
    } else {
      setIsChangingPage(false)
    }
  }, [isActive, currentStep?.page, pathname])

  // ─── Navigation action ────────────────────────────────────────────────────────

  const handleGoToExpectedPage = useCallback(() => {
    if (!currentStep?.page || currentStep.page.endsWith("*")) return
    const expectedPage = currentStep.page
    setIsChangingPage(true)
    router.push(expectedPage)
    window.setTimeout(() => {
      if (!pageMatches(expectedPage, window.location.pathname)) {
        window.location.assign(expectedPage)
      }
    }, 350)
  }, [currentStep?.page, router])

  // ─── Mandatory completion (must run before transitionNavSelector is computed) ──

  const { isMandatoryCompleted } = useMandatoryCompletion({
    isActive,
    currentSubstep,
    currentSlotIndex,
    completionSelector,
    // Pass the substep's own selector here. The nav-link click for page transitions
    // is handled by useAutoAdvance (pathname change), not by this hook.
    expectedSelector: substepExpectedSelector,
    isLastStep,
    nextStep,
  })

  // ─── Page transition state (now uses real isMandatoryCompleted) ───────────────

  const isPageTransition =
    isActive &&
    nextSlot !== null &&
    currentSlot !== null &&
    nextSlot.page !== currentSlot.page &&
    !nextSlot.page.endsWith("*") &&
    (!currentSubstep?.mandatory || isMandatoryCompleted)

  const isWildcardTransition =
    isActive &&
    nextSlot !== null &&
    currentSlot !== null &&
    nextSlot.page !== currentSlot.page &&
    nextSlot.page.endsWith("*") &&
    currentSubstep?.mandatory === true &&
    !isMandatoryCompleted

  const transitionNavSelector = isPageTransition
    ? `[data-tutorial-nav="${nextSlot!.page}"]`
    : null

  const expectedSelector =
    transitionNavSelector ??
    substepExpectedSelector

  // ─── Scroll hook ──────────────────────────────────────────────────────────────

  // scheduleHighlightUpdate is provided by the highlight engine below;
  // we create a ref so the scroll hook can reference it without a circular dep.
  const scheduleHighlightUpdateRef = useRef<
    (opts?: { immediate?: boolean; minIntervalMs?: number }) => void
  >(() => {})

  const { scrollToTarget } = useScrollToTarget({
    headerHeight,
    isMobile,
    pathname,
    scheduleHighlightUpdate: useCallback(
      (opts?: { immediate?: boolean; minIntervalMs?: number }) =>
        scheduleHighlightUpdateRef.current(opts),
      []
    ),
  })

  // ─── Highlight engine ─────────────────────────────────────────────────────────

  const {
    targetElement,
    targetRect,
    activeScrollContainer,
    scheduleHighlightUpdate,
    pendingNextAutoScrollRef,
    retriggerHighlight,
    syncRetries,
    hasSyncTimedOut,
  } = useHighlightEngine({
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
  })

  // Wire schedule ref so the scroll hook calls the latest version
  useEffect(() => {
    scheduleHighlightUpdateRef.current = scheduleHighlightUpdate
  }, [scheduleHighlightUpdate])

  // Re-trigger highlight when mandatory completion flips isPageTransition on
  useEffect(() => {
    if (!isActive || !isPageTransition) return
    retriggerHighlight()
  }, [isActive, isPageTransition, retriggerHighlight])

  // ─── Auto-advance ─────────────────────────────────────────────────────────────

  useAutoAdvance({
    isActive,
    isPageTransition,
    isMandatoryCompleted,
    currentSlot,
    nextSlot,
    currentSubstep,
    pathname,
    nextStep,
  })

  // ─── Drag ─────────────────────────────────────────────────────────────────────

  const { overlayPosition, isDraggingOverlay, handleDragStart } =
    useOverlayDrag({
      isActive,
      isMobile,
      overlayRef,
      clampDeps: [
        currentSlotIndex,
        hasSyncTimedOut,
        isChangingPage,
        isMinimized,
        isPageLoading,
      ],
    })

  // ─── Scroll wheel prevention on overlay ──────────────────────────────────────

  useEffect(() => {
    if (!isActive) return
    const overlayElement = overlayRef.current
    if (!overlayElement) return

    const preventScrollChaining = (event: WheelEvent | TouchEvent) => {
      event.preventDefault()
    }

    overlayElement.addEventListener("wheel", preventScrollChaining, {
      passive: false,
    })
    overlayElement.addEventListener("touchmove", preventScrollChaining, {
      passive: false,
    })
    return () => {
      overlayElement.removeEventListener("wheel", preventScrollChaining)
      overlayElement.removeEventListener("touchmove", preventScrollChaining)
    }
  }, [isActive, currentSlotIndex, isMinimized])

  // ─── Visibility calculations ──────────────────────────────────────────────────

  const windowHeight =
    typeof window !== "undefined" ? window.innerHeight : 800
  const viewportTopPadding = headerHeight + WINDOW_SCROLL_PADDING
  const activeScrollContainerRect =
    activeScrollContainer?.getBoundingClientRect() ?? null
  const targetIsWithinHeader =
    !!targetRect && isRectWithinHeader(targetRect, headerHeight)
  const viewportTopBoundary =
    activeScrollContainer || targetIsWithinHeader ? 0 : viewportTopPadding
  const viewportBottomBoundary = activeScrollContainer
    ? 0
    : WINDOW_SCROLL_PADDING

  const isTargetAbove =
    !!targetRect && targetRect.bottom <= viewportTopBoundary
  const isTargetBelow =
    !!targetRect && targetRect.top >= windowHeight - viewportBottomBoundary
  const isTargetAboveContainer =
    !!targetRect &&
    !!activeScrollContainerRect &&
    targetRect.bottom <=
      activeScrollContainerRect.top + CONTAINER_SCROLL_PADDING
  const isTargetBelowContainer =
    !!targetRect &&
    !!activeScrollContainerRect &&
    targetRect.top >=
      activeScrollContainerRect.bottom - CONTAINER_SCROLL_PADDING

  const isTargetOffScreen = isTargetAbove || isTargetBelow
  const isTargetClippedByContainer =
    isTargetAboveContainer || isTargetBelowContainer

  const showTutorialBackdrop =
    !isMinimized &&
    !isChangingPage &&
    !isPageLoading &&
    !!targetRect &&
    !hasSyncTimedOut
  const showVisibleHighlight =
    showTutorialBackdrop && !isTargetOffScreen && !isTargetClippedByContainer
  const showScrollPrompt =
    showTutorialBackdrop && (isTargetOffScreen || isTargetClippedByContainer)
  const scrollPromptLabel = isTargetClippedByContainer
    ? "Scroll the filter panel to the highlighted option"
    : isTargetAbove
    ? "Scroll up to highlighted element"
    : "Scroll down to highlighted element"
  const scrollPromptDirectionUp = isTargetClippedByContainer
    ? isTargetAboveContainer
    : isTargetAbove

  // ─── Layout helpers ───────────────────────────────────────────────────────────

  // Avoid inline styles for the progress bar width.
  // We bucket to 10% steps so Tailwind can statically include the classes.
  const progressBucket = Math.max(
    0,
    Math.min(100, Math.round(progress / 10) * 10)
  )
  const progressWidthClass =
    progressBucket === 0
      ? "w-0"
      : progressBucket === 10
      ? "w-[10%]"
      : progressBucket === 20
      ? "w-[20%]"
      : progressBucket === 30
      ? "w-[30%]"
      : progressBucket === 40
      ? "w-[40%]"
      : progressBucket === 50
      ? "w-[50%]"
      : progressBucket === 60
      ? "w-[60%]"
      : progressBucket === 70
      ? "w-[70%]"
      : progressBucket === 80
      ? "w-[80%]"
      : progressBucket === 90
      ? "w-[90%]"
      : "w-full"

  const overlayDockClass = isMobile
    ? "left-3 bottom-[calc(6.25rem+env(safe-area-inset-bottom))]"
    : "bottom-4 right-4 sm:bottom-8 sm:right-8"
  const overlayWidthClass = isMinimized
    ? isMobile
      ? "w-[calc(100vw-1.5rem)] max-w-none"
      : "w-72 max-w-[calc(100vw-2rem)]"
    : isMobile
    ? "w-[calc(100vw-1.5rem)] max-w-none"
    : "w-[calc(100vw-2rem)] max-w-[400px]"
  const overlayHeaderClass = isMobile
    ? clsx(
        "flex items-center justify-between border-b border-white/5 p-3 touch-none",
        isDraggingOverlay ? "cursor-grabbing" : "cursor-grab"
      )
    : clsx(
        "flex items-center justify-between p-4 border-b border-white/5",
        isDraggingOverlay ? "cursor-grabbing" : "cursor-grab"
      )
  const overlayBodyClass = isMobile
    ? "max-h-[min(44vh,24rem)] overflow-y-auto p-3"
    : "p-6"
  const overlayActionRowClass = isMobile
    ? "flex items-center gap-2"
    : "flex items-center justify-between"
  const overlayDualActionClass = isMobile
    ? "flex flex-col gap-3 w-full"
    : "flex gap-3 w-full"

  // ─── Render guard ─────────────────────────────────────────────────────────────

  if (!isActive || !currentSlot) return null

  // ─── Markup ───────────────────────────────────────────────────────────────────

  const overlayMarkup = (
    <>
      {/* Backdrop + highlight ring */}
      {showTutorialBackdrop && targetRect && (
        <TutorialBackdrop
          targetRect={targetRect}
          headerHeight={headerHeight}
          targetIsWithinHeader={targetIsWithinHeader}
          isDark={isDark}
          isMobile={isMobile}
          showVisibleHighlight={showVisibleHighlight}
          blockClick={!!currentSubstep?.blockClick}
        />
      )}

      {/* Main control card */}
      <div
        ref={overlayRef}
        data-testid="tutorial-overlay"
        data-tutorial-overlay
        className={clsx(
          "fixed z-[10060] pointer-events-auto shadow-2xl rounded-2xl border overflow-hidden",
          isDraggingOverlay
            ? "transition-none"
            : "transition-all duration-500 ease-in-out",
          isDark
            ? "bg-[#1c1c16] border-[#e8dcc4]/20 text-[#e8dcc4]"
            : "bg-white border-gray-200 text-gray-900",
          overlayPosition ? "left-0 top-0" : overlayDockClass,
          overlayWidthClass
        )}
        style={
          overlayPosition
            ? { left: overlayPosition.left, top: overlayPosition.top }
            : undefined
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-gray-200/20">
          <div
            className={`h-full bg-blue-500 transition-all duration-500 ${progressWidthClass}`}
          />
        </div>

        {/* Card header (drag handle) */}
        <div className={overlayHeaderClass} onPointerDown={handleDragStart}>
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/10 text-blue-500 p-1.5 rounded-lg">
              {isChangingPage || isPageLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lightbulb className="w-4 h-4" />
              )}
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
              {isMinimized
                ? `Paused · ${completedSteps}/${totalSteps}`
                : isPageLoading
                ? "Loading content..."
                : isChangingPage
                ? "Syncing UI..."
                : currentSlot.isGeneral
                ? "Overview"
                : "Tutorial"}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <Minus className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-red-500/20"
              onClick={() => setShowSkipConfirmation(true)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Card body */}
        {isMinimized ? (
          <div
            className={overlayBodyClass}
            onClick={() => setIsMinimized(false)}
          >
            <div className="px-1 py-1 flex items-center justify-between bg-blue-500/5 group cursor-pointer">
              <p className="text-xs font-medium opacity-70 group-hover:opacity-100 transition-opacity">
                Click to resume tutorial
              </p>
              <RefreshCw className="w-3 h-3 text-blue-500 animate-spin-slow" />
            </div>
          </div>
        ) : (
          <TutorialCardBody
            isMinimized={false}
            isPageLoading={isPageLoading}
            isChangingPage={isChangingPage}
            hasSyncTimedOut={hasSyncTimedOut}
            isPageTransition={isPageTransition}
            isWildcardTransition={isWildcardTransition}
            showScrollPrompt={showScrollPrompt}
            isMandatoryCompleted={isMandatoryCompleted}
            isLastStep={isLastStep}
            currentSlot={currentSlot}
            currentStep={currentStep}
            currentSubstep={currentSubstep}
            currentSlotIndex={currentSlotIndex}
            nextSlot={nextSlot}
            totalSteps={totalSteps}
            completedSteps={completedSteps}
            expectedSelector={expectedSelector}
            targetRect={targetRect}
            syncRetries={syncRetries}
            pathname={pathname}
            isMobile={isMobile}
            isDark={isDark}
            scrollPromptLabel={scrollPromptLabel}
            scrollPromptDirectionUp={scrollPromptDirectionUp}
            targetElement={targetElement}
            activeScrollContainer={activeScrollContainer}
            prevStep={prevStep}
            nextStep={nextStep}
            handleGoToExpectedPage={handleGoToExpectedPage}
            onRetryHighlight={() => {
              scheduleHighlightUpdate({ immediate: true })
            }}
            onScrollToTarget={scrollToTarget}
            pendingNextAutoScrollRef={pendingNextAutoScrollRef}
            shouldAutoScrollNextWithinPage={shouldAutoScrollNextWithinPage}
            overlayBodyClass={overlayBodyClass}
            overlayDualActionClass={overlayDualActionClass}
            overlayActionRowClass={overlayActionRowClass}
          />
        )}
      </div>

      {/* Skip confirmation modal */}
      {showSkipConfirmation && (
        <div
          className="fixed inset-0 z-[10020] pointer-events-auto flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className={clsx(
              "w-full max-w-sm p-8 rounded-3xl border shadow-2xl",
              isDark
                ? "bg-[#1c1c16] border-[#e8dcc4]/20"
                : "bg-white border-gray-200"
            )}
          >
            <h2 className="text-2xl font-bold mb-2">End Tutorial?</h2>
            <div className="flex gap-3 mt-8">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setShowSkipConfirmation(false)}
              >
                Keep Going
              </Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={() => {
                  skipTutorial()
                  toast({
                    title: "Tutorial ended",
                    description:
                      "You can restart it anytime from Settings → Learning & Tutorials.",
                  })
                }}
              >
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (typeof document === "undefined") return overlayMarkup
  return createPortal(overlayMarkup, document.body)
}
