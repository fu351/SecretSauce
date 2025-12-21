"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
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
  const router = useRouter()
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

  const MAX_RETRIES = 10;
  const overlayRef = useRef<HTMLDivElement>(null);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDark = theme === "dark"

  /**
   * 1. Stability-Aware Scroll Calculation
   * Centers the element while respecting the Secret Sauce header height.
   */
  const scrollToTarget = useCallback((rect: DOMRect) => {
    const HEADER_OFFSET = 120; 
    const elementCenter = rect.top + window.pageYOffset - (window.innerHeight / 2) + (rect.height / 2);
    const safePosition = Math.max(elementCenter, rect.top + window.pageYOffset - HEADER_OFFSET);

    window.scrollTo({
      top: safePosition,
      behavior: "smooth"
    });
  }, []);

  /**
   * 2. Explore Mode: Global Click Handler
   * Minimizes if clicking outside, but BLOCKED during page changes or locks.
   */
  useEffect(() => {
    if (!isActive || isMinimized) return;
    
    const handleGlobalClick = (e: MouseEvent) => {
      // Logic Guard: Prevent minimization if we are currently transitioning pages
      if (isChangingPage || isPageLocked) return;

      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setIsMinimized(true);
      }
    };

    window.addEventListener("click", handleGlobalClick, true);
    return () => window.removeEventListener("click", handleGlobalClick, true);
  }, [isActive, isMinimized, isChangingPage, isPageLocked]);

  /**
   * 3. Navigation Guard & Sync Reset
   * Manages the "Is Changing Page" state and resets retry counters.
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (pathname !== currentStep.page) {
      setIsChangingPage(true);
      setIsPageLocked(true);
      setTargetRect(null); 
      setSyncRetries(0);
      setHasSyncTimedOut(false);
      router.push(currentStep.page);
    } else {
      // Arrived on correct page: lock Explore Mode briefly to let DOM settle
      setIsPageLocked(true);
      const timer = setTimeout(() => setIsPageLocked(false), 800); 
      return () => clearTimeout(timer);
    }
  }, [isActive, currentStep?.page, pathname, router, currentStepIndex, currentSubstepIndex]);

  /**
   * 4. Stabilized Highlight Engine
   * Includes retry logic to "wait" for elements that might be slow to hydrate.
   */
  const updateHighlight = useCallback((shouldScroll = false) => {
    if (!isActive || !currentStep || isMinimized) return;

    const selector = currentSubstep?.highlightSelector ?? currentStep?.highlightSelector;
    if (!selector) {
      setTargetRect(null);
      setIsChangingPage(false);
      return;
    }

    const element = document.querySelector(selector) as HTMLElement;

    if (!element) {
      // Retry Logic: Try to find the element again after 1 second
      if (syncRetries < MAX_RETRIES) {
        const retryTimer = setTimeout(() => {
          setSyncRetries(prev => prev + 1);
          updateHighlight(shouldScroll);
        }, 1000);
        return () => clearTimeout(retryTimer);
      } else {
        // Stop spinning and show the fail-safe UI
        setHasSyncTimedOut(true);
        setIsChangingPage(false);
        return;
      }
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
  }, [isActive, currentStep, currentSubstep, isMinimized, targetRect, scrollToTarget, syncRetries]);

  /**
   * 5. Filtered Mutation Observer
   */
  useIsomorphicLayoutEffect(() => {
    if (!isActive || isMinimized) return;

    const observer = new MutationObserver((mutations) => {
      const isInternal = mutations.every(m => overlayRef.current?.contains(m.target));
      if (isInternal) return;

      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = setTimeout(() => {
        updateHighlight(pathname === currentStep?.page && !targetRect);
      }, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handlePosUpdate = () => updateHighlight(false);
    window.addEventListener("resize", handlePosUpdate);
    window.addEventListener("scroll", handlePosUpdate, { capture: true, passive: true });
    
    updateHighlight(true);

    return () => {
      observer.disconnect();
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      window.removeEventListener("resize", handlePosUpdate);
      window.removeEventListener("scroll", handlePosUpdate);
    };
  }, [isActive, isMinimized, currentStepIndex, currentSubstepIndex, updateHighlight, pathname, targetRect]);

  if (!isActive || !currentPath || !currentStep) return null;

  const totalUnits = currentPath.steps.reduce((sum, s) => sum + (s.substeps?.length || 1), 0);
  const completedUnits = currentPath.steps.slice(0, currentStepIndex).reduce((sum, s) => sum + (s.substeps?.length || 1), 0) + (currentSubstepIndex + 1);
  const progress = (completedUnits / totalUnits) * 100;

  return (
    <>
      {/* Background Mask */}
      {!isMinimized && !isChangingPage && targetRect && !hasSyncTimedOut && (
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
              {isChangingPage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
              {isMinimized ? "Explore Mode" : (isChangingPage ? "Syncing UI..." : currentPath.name)}
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
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSyncRetries(0); setHasSyncTimedOut(false); updateHighlight(true); }}>
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