"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, ChevronRight, ChevronLeft, ChevronDown, Lightbulb, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/ui/use-toast"
import clsx from "clsx"

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

  // --- State Management ---
  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isChangingPage, setIsChangingPage] = useState(false)
  const [isPageLocked, setIsPageLocked] = useState(false)

  // Retry Logic: Attempt to find element before timing out
  const [syncRetries, setSyncRetries] = useState(0)
  const [hasSyncTimedOut, setHasSyncTimedOut] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)

  const MAX_RETRIES = 15;
  const overlayRef = useRef<HTMLDivElement>(null);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isDark = theme === "dark"

  const totalSteps = flatSequence.length
  const completedSteps = currentSlotIndex + 1
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  const isLastStep = currentSlotIndex === totalSteps - 1
  const stepHighlightSelector = currentStep && 'highlightSelector' in currentStep ? currentStep.highlightSelector : undefined
  const stepAction = currentStep && 'action' in currentStep ? currentStep.action : undefined
  const isExploreMode = (currentSubstep?.action ?? stepAction) === "explore"
  const expectedSelector = currentSubstep?.highlightSelector ?? stepHighlightSelector ?? null

  const handleGoToExpectedPage = useCallback(() => {
    if (!currentStep?.page) return
    const expectedPage = currentStep.page
    setSyncRetries(0)
    setHasSyncTimedOut(false)
    setIsChangingPage(true)
    router.push(expectedPage)

    // Fallback if client navigation fails to fire from the overlay context.
    window.setTimeout(() => {
      if (window.location.pathname !== expectedPage) {
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
    const EXTRA_PADDING = 20;
    const totalTopOffset = headerHeight + EXTRA_PADDING;
    const elementAbsoluteTop = rect.top + window.pageYOffset;
    if (rect.top > totalTopOffset && rect.top < window.innerHeight) {
      return;
    }
    const scrollPosition = Math.max(0, elementAbsoluteTop - totalTopOffset);
    window.scrollTo({ top: scrollPosition, behavior: "smooth" });
  }, [headerHeight]);

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
   * 3. Explore Mode: Global Click Handler
   */
  useEffect(() => {
    if (!isActive || isMinimized) return;
    const handleGlobalClick = (e: MouseEvent) => {
      if (isChangingPage || isPageLocked || isPageLoading) return;
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setIsMinimized(true);
      }
    };
    window.addEventListener("click", handleGlobalClick, true);
    return () => window.removeEventListener("click", handleGlobalClick, true);
  }, [isActive, isMinimized, isChangingPage, isPageLocked, isPageLoading]);

  /**
   * 2b. Tutorial Activation State Reset
   */
  useEffect(() => {
    if (!isActive) return;
    setShowSkipConfirmation(false);
    setIsMinimized(false);
    if (pathname !== currentStep?.page) {
      setTargetRect(null);
    }
    setSyncRetries(0);
    setHasSyncTimedOut(false);
    setIsPageLoading(false);
    setIsChangingPage(false);
  }, [isActive, currentStep?.page, pathname]);

  /**
   * 3. Page Navigation & Transition Management
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;
    if (pathname !== currentStep.page) {
      setIsChangingPage(true);
      setTargetRect(null);
      setSyncRetries(0);
      setHasSyncTimedOut(false);
      setIsPageLoading(false);
    } else {
      setIsChangingPage(false);
      setIsPageLocked(true);
      const timer = setTimeout(() => setIsPageLocked(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isActive, currentStep?.page, pathname]);

  /**
   * 4. Stabilized Highlight Engine
   */
  const updateHighlight = useCallback((shouldScroll = false) => {
    if (!isActive || !currentStep || isMinimized || isPageLoading) return;

    const stepAct = currentStep && 'action' in currentStep ? currentStep.action : undefined
    const currentAction = currentSubstep?.action ?? stepAct;
    if (currentAction === "explore") {
      setTargetRect(null);
      setIsChangingPage(false);
      setHasSyncTimedOut(false);
      setSyncRetries(0);
      return;
    }

    const stepSel = currentStep && 'highlightSelector' in currentStep ? currentStep.highlightSelector : undefined
    const selector = currentSubstep?.highlightSelector ?? stepSel;
    if (!selector) {
      setTargetRect(null);
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
        const delayMs = Math.min(Math.max(2000, 1000 * Math.pow(1.5, syncRetries)), 10000);
        const retryTimer = setTimeout(() => {
          setSyncRetries(prev => prev + 1);
          updateHighlight(shouldScroll);
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
    const hasMoved = !targetRect ||
      Math.abs(newRect.top - targetRect.top) > 2 ||
      Math.abs(newRect.left - targetRect.left) > 2;

    if (hasMoved) {
      const isFirstFind = !targetRect;
      const isOffScreen = newRect.top > window.innerHeight || newRect.bottom < headerHeight;
      if (shouldScroll || (isFirstFind && isOffScreen)) scrollToTarget(newRect);
      setTargetRect(newRect);
    }
  }, [isActive, currentStep, currentSubstep, isMinimized, isPageLoading, targetRect, scrollToTarget, syncRetries, headerHeight]);

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
        const shouldScroll = pathname === currentStep?.page && !targetRect;
        updateHighlight(shouldScroll);
        lastMutationTime = Date.now();
      }, delay);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handlePosUpdate = () => updateHighlight(false);
    window.addEventListener("resize", handlePosUpdate);
    window.addEventListener("scroll", handlePosUpdate, { capture: true, passive: true });

    if (Date.now() - lastHighlightAttempt > MIN_HIGHLIGHT_INTERVAL) {
      lastHighlightAttempt = Date.now();
      updateHighlight(pathname === currentStep?.page && !targetRect);
    }

    return () => {
      observer.disconnect();
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      window.removeEventListener("resize", handlePosUpdate);
      window.removeEventListener("scroll", handlePosUpdate);
    };
  }, [isActive, isMinimized, currentSlotIndex, updateHighlight, pathname, currentStep?.page, targetRect]);

  if (!isActive || !currentSlot) return null;

  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800
  const isTargetAbove = !!targetRect && targetRect.bottom < headerHeight
  const isTargetBelow = !!targetRect && targetRect.top > windowHeight
  const isTargetOffScreen = isTargetAbove || isTargetBelow

  return (
    <>
      {/* Background Mask */}
      {!isMinimized && !isChangingPage && !isPageLoading && targetRect && !hasSyncTimedOut && !isTargetOffScreen && (
        <svg className="fixed inset-0 z-40 pointer-events-none w-full h-full">
          <defs>
            <mask id="tutorial-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - 10}
                y={targetRect.top - 10}
                width={targetRect.width + 20}
                height={targetRect.height + 20}
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
            fill={isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.4)"}
            mask="url(#tutorial-mask)"
            className="backdrop-blur-[2px] transition-opacity duration-500"
          />
        </svg>
      )}

      {/* Scroll indicator — shown when highlighted element is off-screen */}
      {!isMinimized && !isChangingPage && !isPageLoading && isTargetOffScreen && targetRect && (
        <button
          onClick={() => scrollToTarget(targetRect)}
          className={clsx(
            "fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border text-sm font-semibold transition-all animate-bounce",
            isTargetAbove ? "top-20" : "bottom-24",
            isDark
              ? "bg-[#1c1c16] border-[#e8dcc4]/30 text-[#e8dcc4]"
              : "bg-white border-gray-200 text-gray-800"
          )}
        >
          {isTargetAbove ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />}
          {isTargetAbove ? "Scroll up to see highlight" : "Scroll down to see highlight"}
        </button>
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
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
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
          ) : !!expectedSelector && !targetRect && !hasSyncTimedOut && !isExploreMode ? (
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
              {pathname !== currentStep?.page ? (
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
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSyncRetries(0); setHasSyncTimedOut(false); updateHighlight(true); }}>
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
                {currentSubstep?.instruction ?? currentStep?.description}
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

              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentSlotIndex === 0}>
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                  onClick={() => {
                    if (currentSubstep?.action === "click" && expectedSelector) {
                      const el = document.querySelector(expectedSelector) as HTMLElement | null
                      if (el) el.click()
                    }
                    nextStep()
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-8"
                >
                  {isLastStep ? "Finish" : "Next"}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
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
