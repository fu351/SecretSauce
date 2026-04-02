"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial, pageMatches } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, ChevronRight, ChevronLeft, ChevronDown, Lightbulb, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/ui/use-toast"
import clsx from "clsx"
import { useIsMobile } from "@/hooks"

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

  // --- State Management ---
  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const targetRectRef = useRef<DOMRect | null>(null)
  const setTargetRectBoth = (rect: DOMRect | null) => {
    targetRectRef.current = rect
    setTargetRect(rect)
  }
  const [isChangingPage, setIsChangingPage] = useState(false)

  // Retry Logic: Attempt to find element before timing out
  const [syncRetries, setSyncRetries] = useState(0)
  const [hasSyncTimedOut, setHasSyncTimedOut] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [isMandatoryCompleted, setIsMandatoryCompleted] = useState(false)

  const MAX_RETRIES = 15;
  const overlayRef = useRef<HTMLDivElement>(null);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const updateHighlightRef = useRef<() => void>(() => {});
  const [headerHeight, setHeaderHeight] = useState(0);
  const isDark = theme === "dark"

  const pageNames: Record<string, string> = {
    "/recipes": "Recipes",
    "/meal-planner": "Meal Planner",
    "/store": "Shopping",
    "/settings": "Settings",
    "/dashboard": "Dashboard",
    "/home": "Home",
  }

  const totalSteps = flatSequence.length
  const completedSteps = currentSlotIndex + 1
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  const isLastStep = currentSlotIndex === totalSteps - 1
  const stepHighlightSelector = currentStep && 'highlightSelector' in currentStep ? currentStep.highlightSelector : undefined
  const nextSlot = currentSlotIndex < flatSequence.length - 1 ? flatSequence[currentSlotIndex + 1] : null
  const isPageTransition =
    isActive &&
    nextSlot !== null &&
    currentSlot !== null &&
    nextSlot.page !== currentSlot.page &&
    !nextSlot.page.endsWith("*") &&
    (!currentSubstep?.mandatory || isMandatoryCompleted)
  const transitionNavSelector = isPageTransition ? `[data-tutorial-nav="${nextSlot!.page}"]` : null
  const expectedSelector = transitionNavSelector ?? currentSubstep?.highlightSelector ?? stepHighlightSelector ?? null

  const handleGoToExpectedPage = useCallback(() => {
    if (!currentStep?.page || currentStep.page.endsWith("*")) return
    const expectedPage = currentStep.page
    setSyncRetries(0)
    setHasSyncTimedOut(false)
    setIsChangingPage(true)
    router.push(expectedPage)

    // Fallback if client navigation fails to fire from the overlay context.
    window.setTimeout(() => {
      if (!pageMatches(expectedPage, window.location.pathname)) {
        window.location.assign(expectedPage)
      }
    }, 350)
  }, [currentStep?.page, router])

  /**
   * 0. Detect Header Height
   */
  useEffect(() => {
    const detectHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) {
        setHeaderHeight(header.offsetHeight);
      }
    };
    detectHeaderHeight();
    window.addEventListener('resize', detectHeaderHeight);
    return () => window.removeEventListener('resize', detectHeaderHeight);
  }, []);

  /**
   * 1. Stability-Aware Scroll Calculation
   */
  const scrollToTarget = useCallback((rect: DOMRect) => {
    const OVERSHOOT = 80;
    const elementAbsoluteTop = rect.top + window.pageYOffset;
    const elementCenter = elementAbsoluteTop + rect.height / 2;
    const viewportCenter = window.innerHeight / 2;
    const raw = elementCenter - viewportCenter;
    // Only overshoot when scrolling down — upward/top-of-page scrolls clamp to 0 naturally
    const scrollPosition = Math.max(0, raw > 0 ? raw + OVERSHOOT : raw);
    window.scrollTo({ top: scrollPosition, behavior: "smooth" });
  }, []);

  /**
   * 2. Loading State Detector
   */
  useEffect(() => {
    if (!isActive) return;

    const detectPageLoading = () => {
      const getAllWithClass = (selector: string) => {
        return Array.from(document.querySelectorAll(selector)).filter(el => {
          return !overlayRef.current?.contains(el);
        });
      };
      const hasLoadingSpinner = getAllWithClass('[class*="animate-spin"]').length > 0;
      const hasSkeletonLoader = getAllWithClass('[class*="animate-pulse"]').length > 0;
      const hasLoadingClass = getAllWithClass('[class*="loading"]').length > 0;
      setIsPageLoading(!!(hasLoadingSpinner || hasSkeletonLoader || hasLoadingClass));
    };

    detectPageLoading();

    let debounceTimer: NodeJS.Timeout | null = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(detectPageLoading, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isActive]);

  /**
   * 2b. Tutorial Activation State Reset
   */
  useEffect(() => {
    if (!isActive) return;
    setShowSkipConfirmation(false);
    setIsMinimized(false);
    if (currentStep?.page && !pageMatches(currentStep.page, pathname)) {
      setTargetRectBoth(null);
    }
    setSyncRetries(0);
    setHasSyncTimedOut(false);
    setIsPageLoading(false);
    setIsChangingPage(false);
  }, [isActive, currentStep?.page, pathname]);

  /**
   * 2c. Reset state on every slot change — intentionally keep targetRect so the
   * backdrop stays visible while updateHighlight finds the new element (avoids flicker).
   */
  useEffect(() => {
    if (!isActive) return;
    setSyncRetries(0);
    setHasSyncTimedOut(false);
    setIsMandatoryCompleted(false);
  }, [isActive, currentSlotIndex]);

  /**
   * 2f. Mandatory step — listen for a click on the highlighted element to unlock Next
   */
  useEffect(() => {
    if (!isActive || !currentSubstep?.mandatory || !expectedSelector) return;
    const el = document.querySelector(expectedSelector);
    if (!el) return;
    const handler = () => setIsMandatoryCompleted(true);
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [isActive, currentSubstep, expectedSelector]);

  /**
   * 2d. Kick off highlight after a short delay on each slot change.
   * Covers cases where the element isn't in the DOM yet when 2c's state resets land.
   */
  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => updateHighlightRef.current(), 150);
    return () => clearTimeout(timer);
  }, [isActive, currentSlotIndex]);

  /**
   * 2e. Re-trigger highlight when page loading clears — updateHighlight exits early
   * while isPageLoading is true, so we need an explicit retry once it settles.
   */
  useEffect(() => {
    if (!isActive || isPageLoading) return;
    updateHighlightRef.current();
  }, [isActive, isPageLoading]);

  /**
   * 3. Page Navigation & Transition Management
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;
    if (!pageMatches(currentStep.page, pathname)) {
      setIsChangingPage(true);
      setTargetRectBoth(null);
      setSyncRetries(0);
      setHasSyncTimedOut(false);
      setIsPageLoading(false);
    } else {
      setIsChangingPage(false);
    }
  }, [isActive, currentStep?.page, pathname]);

  /**
   * 4. Stabilized Highlight Engine
   */
  const updateHighlight = useCallback(() => {
    if (!isActive || !currentStep || isMinimized || isPageLoading) return;

    const stepSel = currentStep && 'highlightSelector' in currentStep ? currentStep.highlightSelector : undefined
    const selector = transitionNavSelector ?? currentSubstep?.highlightSelector ?? stepSel;
    if (!selector) {
      setTargetRectBoth(null);
      setIsChangingPage(false);
      return;
    }

    const candidates = Array.from(document.querySelectorAll(selector)) as HTMLElement[]
    const element = candidates.find((candidate) => {
      const style = window.getComputedStyle(candidate)
      if (style.display === "none" || style.visibility === "hidden") return false
      const rect = candidate.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }) || candidates[0] || null

    if (!element) {
      if (syncRetries < MAX_RETRIES && !isPageLoading) {
        const delayMs = Math.min(300 * Math.pow(1.8, syncRetries), 8000);
        const retryTimer = setTimeout(() => {
          setSyncRetries(prev => prev + 1);
          updateHighlight();
        }, delayMs);
        return () => clearTimeout(retryTimer);
      } else if (!isPageLoading) {
        setHasSyncTimedOut(true);
        setIsChangingPage(false);
        return;
      }
      return;
    }

    setIsChangingPage(false);
    setHasSyncTimedOut(false);
    setSyncRetries(0);

    const newRect = element.getBoundingClientRect();
    const prev = targetRectRef.current;
    const hasMoved = !prev ||
      Math.abs(newRect.top - prev.top) > 2 ||
      Math.abs(newRect.left - prev.left) > 2;

    if (hasMoved) {
      setTargetRectBoth(newRect);
    }
  }, [isActive, currentStep, currentSubstep, isMinimized, isPageLoading, syncRetries, transitionNavSelector]);

  /** Keep a stable ref so delayed callbacks always call the latest version */
  useEffect(() => { updateHighlightRef.current = updateHighlight; }, [updateHighlight]);

  /**
   * 5. Filtered Mutation Observer
   */
  useIsomorphicLayoutEffect(() => {
    if (!isActive || isMinimized) return;

    let lastMutationTime = Date.now();
    let lastHighlightAttempt = 0;
    const DEBOUNCE_INTERVAL = 150;
    const MIN_HIGHLIGHT_INTERVAL = 500;

    const observer = new MutationObserver((mutations) => {
      const isInternal = mutations.every(m => overlayRef.current?.contains(m.target));
      if (isInternal) return;
      const now = Date.now();
      if (now - lastHighlightAttempt < MIN_HIGHLIGHT_INTERVAL) return;
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      const timeSinceLastMutation = now - lastMutationTime;
      const delay = Math.max(0, DEBOUNCE_INTERVAL - timeSinceLastMutation);
      stabilityTimerRef.current = setTimeout(() => {
        lastHighlightAttempt = Date.now();
        updateHighlight();
        lastMutationTime = Date.now();
      }, delay);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handlePosUpdate = () => updateHighlight();
    window.addEventListener("resize", handlePosUpdate);
    window.addEventListener("scroll", handlePosUpdate, { capture: true, passive: true });

    if (Date.now() - lastHighlightAttempt > MIN_HIGHLIGHT_INTERVAL) {
      lastHighlightAttempt = Date.now();
      updateHighlight();
    }

    return () => {
      observer.disconnect();
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      window.removeEventListener("resize", handlePosUpdate);
      window.removeEventListener("scroll", handlePosUpdate);
    };
  }, [isActive, isMinimized, currentSlotIndex, updateHighlight, pathname, currentStep?.page]);

  if (isMobile) return null;

  /**
   * 6. Auto-advance when user navigates to the next page via the highlighted nav link
   */
  useEffect(() => {
    if (!isPageTransition || !nextSlot) return
    if (pageMatches(nextSlot.page, pathname)) {
      nextStep()
    }
  }, [isPageTransition, nextSlot, pathname, nextStep])

  /**
   * 6b. Auto-advance when a mandatory click navigates to a wildcard next page.
   * (Effect #6 / isPageTransition excludes wildcard pages, so this handles that case.)
   */
  useEffect(() => {
    if (!isMandatoryCompleted || !nextSlot || !currentSlot) return
    if (nextSlot.page === currentSlot.page) return
    if (!nextSlot.page.endsWith("*")) return
    if (pageMatches(nextSlot.page, pathname)) {
      nextStep()
    }
  }, [isMandatoryCompleted, nextSlot, currentSlot, pathname, nextStep])
  if (!isActive || !currentSlot) return null;

  // Avoid inline styles for the progress bar width (linter rule).
  // We bucket to 10% steps so Tailwind can statically include the classes.
  const progressBucket = Math.max(0, Math.min(100, Math.round(progress / 10) * 10))
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

  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800
  const isTargetAbove = !!targetRect && targetRect.top < 0
  const isTargetBelow = !!targetRect && targetRect.top > windowHeight
  const isTargetOffScreen = isTargetAbove || isTargetBelow
  const showTutorialBackdrop = !isMinimized && !isChangingPage && !isPageLoading && !!targetRect && !hasSyncTimedOut
  const showVisibleHighlight = showTutorialBackdrop && !isTargetOffScreen
  const showScrollPrompt = showTutorialBackdrop && isTargetOffScreen

  return (
    <>
      {/* Background Mask */}
      {showTutorialBackdrop && (
        <>
          {showVisibleHighlight ? (
            <svg className="fixed inset-0 z-40 pointer-events-none w-full h-full">
              <defs>
                <mask id="tutorial-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect
                    x={targetRect!.left - 10}
                    y={targetRect!.top - 10}
                    width={targetRect!.width + 20}
                    height={targetRect!.height + 20}
                    rx="12"
                    fill="black"
                    className="transition-all duration-300 ease-out"
                  />
                  <rect x="0" y="0" width="100%" height={headerHeight} fill="black" />
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill={isDark ? "rgba(0,0,0,0.78)" : "rgba(17,24,39,0.45)"}
                mask="url(#tutorial-mask)"
                className="backdrop-blur-[2px] transition-opacity duration-500"
              />
            </svg>
          ) : (
            <div
              className={clsx(
                "fixed inset-0 z-40 pointer-events-none backdrop-blur-[2px] transition-opacity duration-500",
                isDark ? "bg-black/80" : "bg-slate-950/45"
              )}
            />
          )}

          {showVisibleHighlight && (
            <div
              className="fixed z-[45] pointer-events-none rounded-[18px] border-2 border-blue-400 transition-all duration-300 ease-out"
              style={{
                top: targetRect!.top - 12,
                left: targetRect!.left - 12,
                width: targetRect!.width + 24,
                height: targetRect!.height + 24,
                boxShadow: isDark
                  ? "0 0 0 2px rgba(96,165,250,0.9), 0 0 24px rgba(96,165,250,0.55)"
                  : "0 0 0 2px rgba(37,99,235,0.9), 0 0 24px rgba(59,130,246,0.35)",
              }}
            >
              <div className="absolute inset-0 rounded-[16px] border border-white/50" />
            </div>
          )}
        </>
      )}


      {/* Main Control Card */}
      <div
        ref={overlayRef}
        data-testid="tutorial-overlay"
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-50 transition-all duration-500 ease-in-out shadow-2xl rounded-2xl border overflow-hidden",
          isDark ? "bg-[#1c1c16] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-gray-200 text-gray-900",
          isMinimized ? "w-72 max-w-[calc(100vw-2rem)]" : "w-[calc(100vw-2rem)] max-w-[400px]"
        )}
      >
        <div className="h-1.5 w-full bg-gray-200/20">
          <div className={`h-full bg-blue-500 transition-all duration-500 ${progressWidthClass}`} />
        </div>

        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/10 text-blue-500 p-1.5 rounded-lg">
              {isChangingPage || isPageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
              {isMinimized
                ? `Paused · ${completedSteps}/${totalSteps}`
                : (isPageLoading ? "Loading content..." : (isChangingPage ? "Syncing UI..." : (currentSlot.isGeneral ? "Overview" : "Tutorial")))}
            </span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(!isMinimized)}>
              {isMinimized ? <ChevronUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-500/20" onClick={() => setShowSkipConfirmation(true)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-6">
          {isMinimized ? (
            <div className="px-1 py-1 flex items-center justify-between bg-blue-500/5 group cursor-pointer" onClick={() => setIsMinimized(false)}>
              <p className="text-xs font-medium opacity-70 group-hover:opacity-100 transition-opacity">Click to resume tutorial</p>
              <RefreshCw className="w-3 h-3 text-blue-500 animate-spin-slow" />
            </div>
          ) : isPageLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-medium opacity-60">Waiting for page to load...</p>
            </div>
          ) : isChangingPage ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-medium opacity-60">Preparing next step...</p>
            </div>
          ) : !!expectedSelector && !targetRect && !hasSyncTimedOut ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-medium opacity-70">Scanning for element…</p>
              <p className="text-[10px] opacity-40 mt-1">
                Attempt {syncRetries + 1} of {MAX_RETRIES}
              </p>
            </div>
          ) : hasSyncTimedOut ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
              <h4 className="font-bold text-lg mb-1">We lost track</h4>
              {currentStep?.page && !pageMatches(currentStep.page, pathname) ? (
                <>
                  <p className="text-xs opacity-60 mb-1">Not on the right page?</p>
                  <p className="text-[10px] opacity-40 mb-6">Expected: <span className="font-mono">{currentStep?.page}</span> · Current: <span className="font-mono">{pathname}</span></p>
                  <div className="flex gap-3 w-full">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleGoToExpectedPage}>
                      Go There
                    </Button>
                    <Button size="sm" className="flex-1 bg-blue-600" onClick={nextStep}>
                      Continue Anyway
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs opacity-60 mb-2">We couldn't find the UI element for this step.</p>
                  <p className="text-[10px] opacity-40 mb-6">
                    Step {completedSteps} of {totalSteps}
                    {expectedSelector ? <> · Selector: <span className="font-mono">{expectedSelector}</span></> : null}
                  </p>
                  <div className="flex gap-3 w-full">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSyncRetries(0); setHasSyncTimedOut(false); updateHighlight(); }}>
                      Retry
                    </Button>
                    <Button size="sm" className="flex-1 bg-blue-600" onClick={nextStep}>
                      Continue Anyway
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <p className={clsx("text-[11px] uppercase tracking-[0.18em] mb-2 font-semibold", isDark ? "text-[#e8dcc4]/55" : "text-gray-500")}>
                Step {completedSteps} of {totalSteps}
              </p>
              <h3 className="text-xl font-bold mb-2 leading-tight">{currentStep?.title}</h3>
              <p className={clsx("text-sm leading-relaxed mb-6", isDark ? "text-gray-400" : "text-gray-600")}>
                {isPageTransition
                  ? `You're done here. Use the navigation to go to ${pageNames[nextSlot!.page] ?? nextSlot!.page}.`
                  : (currentSubstep?.instruction ?? currentStep?.description)}
              </p>

              {/* Tips — only shown at rank 1 (primary goal), not on general slots */}
              {!currentSlot.isGeneral && currentSlot.rank === 1 && currentStep && 'tips' in currentStep && currentStep.tips && currentStep.tips.length > 0 && (
                <div className={clsx("mb-6 p-3 rounded-lg", isDark ? "bg-blue-500/10" : "bg-blue-50")}>
                  <p className="text-xs font-semibold mb-1 opacity-60">Tips</p>
                  <ul className="space-y-1">
                    {currentStep.tips.map((tip, i) => (
                      <li key={i} className="text-xs opacity-70">{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showScrollPrompt ? (
                <button
                  onClick={() => scrollToTarget(targetRect!)}
                  className={clsx(
                    "w-full flex items-center gap-3 rounded-xl border px-4 py-3 animate-bounce transition-colors",
                    isDark ? "border-blue-400/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                    {isTargetAbove ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                  <span className="text-sm font-medium">
                    {isTargetAbove ? "Scroll up to highlighted element" : "Scroll down to highlighted element"}
                  </span>
                </button>
              ) : isPageTransition ? (
                <div className={clsx("flex items-center gap-3 rounded-xl px-4 py-3 border", isDark ? "bg-blue-500/10 border-blue-400/25 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700")}>
                  <ChevronUp className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-medium leading-snug">
                    Click <strong>{pageNames[nextSlot!.page] ?? nextSlot!.page}</strong> in the navigation above to continue
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentSlotIndex === 0}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button
                    disabled={!!currentSubstep?.mandatory && !isMandatoryCompleted}
                    onClick={() => {
                      if (currentSubstep?.action === "click" && expectedSelector) {
                        const el = document.querySelector(expectedSelector) as HTMLElement | null
                        if (el) el.click()
                      }
                      nextStep()
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLastStep ? "Finish" : "Next"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Skip Confirmation Modal */}
      {showSkipConfirmation && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className={clsx("w-full max-w-sm p-8 rounded-3xl border shadow-2xl", isDark ? "bg-[#1c1c16] border-[#e8dcc4]/20" : "bg-white border-gray-200")}>
            <h2 className="text-2xl font-bold mb-2">End Tutorial?</h2>
            <div className="flex gap-3 mt-8">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowSkipConfirmation(false)}>Keep Going</Button>
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => {
                skipTutorial()
                toast({ title: "Tutorial ended", description: "You can restart it anytime from Settings → Learning & Tutorials." })
              }}>Exit</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
