"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, ChevronRight, ChevronLeft } from "lucide-react"
import clsx from "clsx"

export function TutorialOverlay() {
  const {
    isActive,
    currentPath,
    currentStep,
    currentStepIndex,
    currentSubstep,
    currentSubstepIndex,
    nextStep,
    prevStep,
    skipTutorial,
  } = useTutorial()

  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()

  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isOverlayObstructing, setIsOverlayObstructing] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)

  const isDark = theme === "dark"
  const onCorrectPage = currentStep ? pathname === currentStep.page : false

  /* ---------------------------------------------
   * Highlight selector (SUBSTEP FIRST)
   * --------------------------------------------*/
  const activeHighlightSelector =
    currentSubstep?.highlightSelector ?? currentStep?.highlightSelector

  /* ---------------------------------------------
   * Progress calculation (SUBSTEP-BASED)
   * --------------------------------------------*/
  const totalUnits = currentPath
    ? currentPath.steps.reduce((sum, step) => sum + (step.substeps?.length || 1), 0)
    : 1

  const completedUnits = currentPath
    ? currentPath.steps
        .slice(0, currentStepIndex)
        .reduce((sum, step) => sum + (step.substeps?.length || 1), 0) +
      (currentSubstepIndex + 1)
    : 0

  const progress = (completedUnits / totalUnits) * 100

  /* ---------------------------------------------
   * Substep flags
   * --------------------------------------------*/
  const hasSubsteps = currentStep?.substeps && currentStep.substeps.length > 0
  const isLastSubstep = !hasSubsteps || currentSubstepIndex === currentStep.substeps!.length - 1
  const isLastStep = !!currentPath && currentStepIndex === currentPath.steps.length - 1

  /* ---------------------------------------------
 * Highlight positioning & Auto-scroll
 * --------------------------------------------*/

// 1. SSR-Safe Hook: Prevents "useLayoutEffect does not do anything on the server" warning
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// 2. Ref to store the active animation frame ID so we can cancel it
const rafRef = useRef(null);

// Helper to get rect (used for resize/scroll updates)
const getRect = useCallback(() => {
  if (!activeHighlightSelector) return null;
  const element = document.querySelector(activeHighlightSelector);
  return element ? element.getBoundingClientRect() : null;
}, [activeHighlightSelector]);

// Main function: Hides highlight, scrolls, waits for stop, then shows highlight
const scrollToAndHighlight = useCallback(() => {
  // Cancel any existing loops to prevent conflicts
  if (rafRef.current) {
    cancelAnimationFrame(rafRef.current);
  }

  // Safety checks
  if (!activeHighlightSelector || !onCorrectPage) {
    setTargetRect(null);
    return;
  }

  const element = document.querySelector(activeHighlightSelector);
  if (!element) {
    setTargetRect(null);
    return;
  }

  // A. HIDE the highlight immediately (cleaner UX during scroll)
  setTargetRect(null);

  // B. Start Smooth Scroll to CENTER
  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest"
  });

  // C. Wait for Scroll to Finish
  let lastTop = null;
  let stableFrames = 0;

  const waitForScrollStop = () => {
    const rect = element.getBoundingClientRect();

    // Check stability
    if (rect.top === lastTop) {
      stableFrames++;
    } else {
      stableFrames = 0;
      lastTop = rect.top;
    }

    // Threshold: 5 frames (~80ms of stillness) means scroll is done
    if (stableFrames > 5) {
      // D. SHOW the highlight now that we are steady
      setTargetRect(rect);
      
      // Update obstruction logic
      const isBottomRight =
        rect.bottom > window.innerHeight - 250 &&
        rect.right > window.innerWidth - 350;
      
      setIsOverlayObstructing(isBottomRight);
      
      rafRef.current = null;
      return;
    }

    // Keep checking
    rafRef.current = requestAnimationFrame(waitForScrollStop);
  };

  // Start the check loop
  rafRef.current = requestAnimationFrame(waitForScrollStop);

}, [activeHighlightSelector, onCorrectPage]);


// 3. Effect to trigger the logic
useIsomorphicLayoutEffect(() => {
  scrollToAndHighlight();

  // Standard listener to keep box attached during manual resize/scroll
  const handleResizeOrScroll = () => {
    // KEY FIX: Use RAF to ensure we read the rect AFTER the browser has painted
    requestAnimationFrame(() => {
      const rect = getRect();
      if (rect) setTargetRect(rect);
    });
  };

  window.addEventListener("resize", handleResizeOrScroll);
  window.addEventListener("scroll", handleResizeOrScroll, { capture: true, passive: true });

  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    window.removeEventListener("resize", handleResizeOrScroll);
    window.removeEventListener("scroll", handleResizeOrScroll);
  };
}, [scrollToAndHighlight, getRect, currentStepIndex, currentSubstepIndex, isMinimized]);

if (!isActive || !currentPath || !currentStep) return null;

  /* ---------------------------------------------
   * Styling
   * --------------------------------------------*/
  const cardBg = isDark ? "bg-[#181813]" : "bg-white"
  const cardBorder = isDark ? "border-[#e8dcc4]/30" : "border-gray-200"
  const cardText = isDark ? "text-[#e8dcc4]" : "text-gray-900"
  const mutedText = isDark ? "text-[#e8dcc4]/60" : "text-gray-500"

  return (
    <>
      {/* ---------- BACKDROP + HIGHLIGHT ---------- */}
      {!isMinimized && (
        targetRect ? (
          <div
            className="fixed inset-0 z-40 pointer-events-none transition-all duration-500 ease-in-out"
            style={{
              boxShadow: `0 0 0 9999px ${
                isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.5)"
              }`,
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              borderRadius: "8px",
              position: "absolute",
            }}
          >
            <div className="absolute inset-0 border-2 border-blue-500/50 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div
            className={clsx(
              "fixed inset-0 z-40 pointer-events-none transition-opacity duration-500",
              isDark ? "bg-black/50" : "bg-black/20"
            )}
          />
        )
      )}

      {/* ---------- OVERLAY CARD ---------- */}
      <div
        ref={overlayRef}
        className={clsx(
          "fixed z-50 transition-all duration-500 ease-in-out shadow-2xl rounded-xl border overflow-hidden",
          cardBg,
          cardBorder,
          cardText,
          isOverlayObstructing ? "bottom-6 left-6" : "bottom-6 right-6",
          isMinimized ? "w-auto" : "w-[380px]"
        )}
      >
        {!isMinimized && (
          <div className="h-1 w-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* ---------- HEADER ---------- */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold">
              {currentStepIndex + 1}.{currentSubstepIndex + 1}
            </div>

            {isMinimized ? (
              <span className="text-sm font-medium">Tutorial paused</span>
            ) : (
              <span className={clsx("text-xs font-semibold tracking-widest uppercase", mutedText)}>
                {currentPath.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-7 w-7 p-0"
              title={isMinimized ? "Expand tutorial" : "Minimize tutorial"}
            >
              {isMinimized ? <ChevronUp className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </Button>

            {!isMinimized && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSkipConfirmation(true)}
                className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
                title="Close tutorial"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* ---------- BODY ---------- */}
        {!isMinimized && (
          <div className="px-5 pb-5 pt-1">
            <h3 className="text-lg font-bold mb-2">{currentStep.title}</h3>

            <p className={clsx("text-sm leading-relaxed mb-4", mutedText)}>
              {currentSubstep?.instruction ?? currentStep.description}
            </p>

            {/* ---------- FOOTER ---------- */}
            <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                disabled={currentStepIndex === 0 && currentSubstepIndex === 0}
                className="text-xs text-gray-500"
              >
                <ChevronLeft className="w-3 h-3 mr-1" />
                Back
              </Button>

              <Button
                size="sm"
                onClick={nextStep}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                {isLastStep && isLastSubstep
                  ? "Finish"
                  : isLastSubstep
                  ? "Next section"
                  : "Next highlight"}
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- SKIP CONFIRMATION ---------- */}
      {showSkipConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSkipConfirmation(false)}
          />
          <div
            className={clsx(
              "relative rounded-xl shadow-2xl p-6 max-w-sm w-full",
              cardBg,
              cardBorder,
              "border"
            )}
          >
            <h2 className={clsx("text-lg font-bold mb-2", cardText)}>
              End tutorial?
            </h2>
            <p className={clsx("text-sm mb-6", mutedText)}>
              You can always restart it later from your dashboard settings.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowSkipConfirmation(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowSkipConfirmation(false)
                  skipTutorial()
                }}
                variant="destructive"
                className="flex-1"
              >
                End Tutorial
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
