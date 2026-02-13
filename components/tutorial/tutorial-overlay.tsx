"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname } from "next/navigation"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, ChevronRight, ChevronLeft, Lightbulb, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import clsx from "clsx"

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
  const pathname = usePathname()

  // --- State Management ---
  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isChangingPage, setIsChangingPage] = useState(false)
  const [isPageLocked, setIsPageLocked] = useState(false)
  
  // Retry Logic: Attempt to find element 10 times (1s apart) before timing out
  const [syncRetries, setSyncRetries] = useState(0)
  const [hasSyncTimedOut, setHasSyncTimedOut] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)

  const MAX_RETRIES = 10;
  const overlayRef = useRef<HTMLDivElement>(null);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const isDark = theme === "dark"

  /**
   * 0. Detect Header Height
   * Dynamically measures the sticky header to properly offset scroll calculations.
   */
  useEffect(() => {
    const detectHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) {
        setHeaderHeight(header.offsetHeight);
      }
    };

    // Initial detection
    detectHeaderHeight();

    // Re-detect on resize (header height may change on responsive breakpoints)
    window.addEventListener('resize', detectHeaderHeight);
    return () => window.removeEventListener('resize', detectHeaderHeight);
  }, []);

  /**
   * 1. Stability-Aware Scroll Calculation
   * Scrolls to make the highlighted element visible below the sticky header.
   * Avoids excessive centering that can cause unwanted scrolling.
   */
  const scrollToTarget = useCallback((rect: DOMRect) => {
    // Add extra padding beyond header height for comfortable viewing
    const EXTRA_PADDING = 20;
    const totalTopOffset = headerHeight + EXTRA_PADDING;

    // Element's absolute position on the page
    const elementAbsoluteTop = rect.top + window.pageYOffset;

    // If element is already visible below header, don't scroll
    if (rect.top > totalTopOffset && rect.top < window.innerHeight) {
      return; // Element is already in comfortable viewing range
    }

    // Scroll to position element just below the header
    const scrollPosition = Math.max(0, elementAbsoluteTop - totalTopOffset);

    window.scrollTo({
      top: scrollPosition,
      behavior: "smooth"
    });
  }, [headerHeight]);

  /**
   * 2. Loading State Detector
   * Watches for loading spinners and skeleton loaders on the page.
   * Prevents highlight attempts while page content is still loading.
   * Excludes overlay elements to avoid false positives.
   */
  useEffect(() => {
    if (!isActive) return;

    const detectPageLoading = () => {
      // Check for common loading indicators, but exclude overlay ref
      const getAllWithClass = (selector: string) => {
        return Array.from(document.querySelectorAll(selector)).filter(el => {
          // Exclude overlay and its children
          return !overlayRef.current?.contains(el);
        });
      };

      const hasLoadingSpinner = getAllWithClass('[class*="animate-spin"]').length > 0;
      const hasSkeletonLoader = getAllWithClass('[class*="animate-pulse"]').length > 0;
      const hasLoadingClass = getAllWithClass('[class*="loading"]').length > 0;

      const isLoading = !!(hasLoadingSpinner || hasSkeletonLoader || hasLoadingClass);
      setIsPageLoading(isLoading);
    };

    // Initial check
    detectPageLoading();

    // Watch for loading state changes via MutationObserver
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
   * Minimizes if clicking outside, but BLOCKED during page changes or locks.
   */
  useEffect(() => {
    if (!isActive || isMinimized) return;

    const handleGlobalClick = (e: MouseEvent) => {
      // Logic Guard: Prevent minimization if we are currently transitioning pages or loading
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
   * Resets local overlay state when tutorial is activated/restarted.
   * Clears any lingering UI states from previous session.
   */
  useEffect(() => {
    if (!isActive) return;

    // Reset all local UI states when tutorial becomes active
    // But preserve targetRect if we're on the correct page to avoid losing current highlight
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
   * Handles page transitions and shows loading state during navigation.
   * Locks Explore Mode when arriving on tutorial page to let DOM settle.
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (pathname !== currentStep.page) {
      // User is on a different page than the tutorial step requires
      // Show loading state to indicate we're waiting for page transition
      setIsChangingPage(true);
      setTargetRect(null);
      setSyncRetries(0);
      setHasSyncTimedOut(false);
      // Keep loading state on while not on correct page
      setIsPageLoading(false);
    } else {
      // Arrived on the tutorial step's page: clear the transition state
      // and lock Explore Mode to let DOM fully settle before highlighting
      setIsChangingPage(false);
      setIsPageLocked(true);
      const timer = setTimeout(() => {
        setIsPageLocked(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isActive, currentStep?.page, pathname]);

  /**
   * 4. Stabilized Highlight Engine
   * Includes retry logic with exponential backoff to "wait" for elements that might be slow to hydrate.
   * Skips attempts while page is loading to avoid finding skeleton/placeholder elements.
   */
  const updateHighlight = useCallback((shouldScroll = false) => {
    if (!isActive || !currentStep || isMinimized || isPageLoading) return;

    const selector = currentSubstep?.highlightSelector ?? currentStep?.highlightSelector;
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
      // Retry Logic: Try to find the element again with exponential backoff
      // But only retry if page is not loading (to wait for content to render)
      if (syncRetries < MAX_RETRIES && !isPageLoading) {
        // Use exponential backoff: 1s, 2s, 4s, etc. to reduce spamming
        const delayMs = Math.min(1000 * Math.pow(1.5, syncRetries), 10000);
        const retryTimer = setTimeout(() => {
          setSyncRetries(prev => prev + 1);
          updateHighlight(shouldScroll);
        }, delayMs);
        return () => clearTimeout(retryTimer);
      } else if (!isPageLoading) {
        // Stop spinning and show the fail-safe UI (only if page is fully loaded)
        setHasSyncTimedOut(true);
        setIsChangingPage(false);
        return;
      }
      // If page is still loading, defer this attempt
      return;
    }

    // Success: Found the element
    setIsChangingPage(false);
    setHasSyncTimedOut(false);
    setSyncRetries(0);

    const newRect = element.getBoundingClientRect();

    // Prevent excessive updates if movement is sub-pixel
    const hasMoved = !targetRect ||
      Math.abs(newRect.top - targetRect.top) > 2 ||
      Math.abs(newRect.left - targetRect.left) > 2;

    if (hasMoved) {
      if (shouldScroll) scrollToTarget(newRect);
      setTargetRect(newRect);
    }
  }, [isActive, currentStep, currentSubstep, isMinimized, isPageLoading, targetRect, scrollToTarget, syncRetries]);

  /**
   * 5. Filtered Mutation Observer
   * Watches for DOM changes and re-syncs highlight position.
   * Includes guards to prevent rapid re-triggering and excessive sync attempts.
   */
  useIsomorphicLayoutEffect(() => {
    if (!isActive || isMinimized) return;

    let lastMutationTime = Date.now();
    let lastHighlightAttempt = 0;
    const DEBOUNCE_INTERVAL = 150;
    const MIN_HIGHLIGHT_INTERVAL = 500; // Prevent spamming highlight attempts

    const observer = new MutationObserver((mutations) => {
      const isInternal = mutations.every(m => overlayRef.current?.contains(m.target));
      if (isInternal) return;

      const now = Date.now();

      // Don't update if we just attempted highlight very recently
      if (now - lastHighlightAttempt < MIN_HIGHLIGHT_INTERVAL) {
        return;
      }

      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);

      const timeSinceLastMutation = now - lastMutationTime;
      const delay = Math.max(0, DEBOUNCE_INTERVAL - timeSinceLastMutation);

      stabilityTimerRef.current = setTimeout(() => {
        // Mark attempt time before calling updateHighlight
        lastHighlightAttempt = Date.now();
        // Only scroll on first successful highlight on the correct page
        // Don't scroll on subsequent DOM mutations after we already have a target
        const shouldScroll = pathname === currentStep?.page && !targetRect;
        updateHighlight(shouldScroll);
        lastMutationTime = Date.now();
      }, delay);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handlePosUpdate = () => updateHighlight(false);
    window.addEventListener("resize", handlePosUpdate);
    window.addEventListener("scroll", handlePosUpdate, { capture: true, passive: true });

    // Initial sync when effect runs (only if we haven't just synced)
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
  }, [isActive, isMinimized, currentStepIndex, currentSubstepIndex, updateHighlight, pathname, currentStep?.page, targetRect]);

  if (!isActive || !currentPath || !currentStep) return null;

  const totalUnits = currentPath.steps.reduce((sum, s) => sum + (s.substeps?.length || 1), 0);
  const completedUnits = currentPath.steps.slice(0, currentStepIndex).reduce((sum, s) => sum + (s.substeps?.length || 1), 0) + (currentSubstepIndex + 1);
  const progress = (completedUnits / totalUnits) * 100;

  return (
    <>
      {/* Background Mask - Excludes header area to avoid overlap */}
      {!isMinimized && !isChangingPage && !isPageLoading && targetRect && !hasSyncTimedOut && (
        <svg className="fixed inset-0 z-40 pointer-events-none w-full h-full">
          <defs>
            <mask id="tutorial-mask">
              {/* White background - visible area */}
              <rect width="100%" height="100%" fill="white" />
              {/* Black hole - the highlighted element (cut out from the dark overlay) */}
              <rect
                x={targetRect.left - 10}
                y={targetRect.top - 10}
                width={targetRect.width + 20}
                height={targetRect.height + 20}
                rx="12"
                fill="black"
                className="transition-all duration-300 ease-out"
              />
              {/* Also cut out the header area to prevent overlap */}
              <rect
                x="0"
                y="0"
                width="100%"
                height={headerHeight}
                fill="black"
              />
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

      {/* Main Control Card - Strict Bottom Right */}
      <div
        ref={overlayRef}
        className={clsx(
          "fixed bottom-8 right-8 z-50 transition-all duration-500 ease-in-out shadow-2xl rounded-2xl border overflow-hidden",
          isDark ? "bg-[#1c1c16] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-gray-200 text-gray-900",
          isMinimized ? "w-72" : "w-[400px]"
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
              {isMinimized ? "Explore Mode" : (isPageLoading ? "Loading content..." : (isChangingPage ? "Syncing UI..." : currentPath.name))}
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
          ) : hasSyncTimedOut ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
              <h4 className="font-bold text-lg mb-1">Element Not Found</h4>
              <p className="text-xs opacity-60 mb-6">We couldn't locate the UI element for this step.</p>
              <div className="flex gap-3 w-full">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { window.location.reload(); }}>
                  Retry
                </Button>
                <Button size="sm" className="flex-1 bg-blue-600" onClick={nextStep}>
                  Skip Step
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-xl font-bold mb-2 leading-tight">{currentStep.title}</h3>
              <p className={clsx("text-sm leading-relaxed mb-6", isDark ? "text-gray-400" : "text-gray-600")}>
                {currentSubstep?.instruction ?? currentStep.description}
              </p>

              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentStepIndex === 0 && currentSubstepIndex === 0}>
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-500 text-white px-8">
                  {currentStepIndex === currentPath.steps.length - 1 && (!currentStep.substeps || currentSubstepIndex === currentStep.substeps.length - 1) ? "Finish" : "Next"}
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
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={skipTutorial}>Exit</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
