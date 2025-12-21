"use client"

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { X, Minus, ChevronUp, ChevronRight, ChevronLeft, Lightbulb, Loader2, MousePointer2 } from "lucide-react"
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

  const [isMinimized, setIsMinimized] = useState(false)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isOverlayObstructing, setIsOverlayObstructing] = useState(false)
  const [isChangingPage, setIsChangingPage] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDark = theme === "dark"

  /**
   * 1. Stability-Aware Scroll Calculation
   * Accounts for the overhead header height and prevents sub-pixel loops.
   */
  const scrollToTarget = useCallback((rect: DOMRect) => {
    const HEADER_OFFSET = 110; // Matches your Secret Sauce navigation bar height
    const offsetPosition = rect.top + window.pageYOffset - HEADER_OFFSET;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth"
    });
  }, []);

  /**
   * 2. Explore Mode: Global Click Handler
   * Minimizes the tutorial card if user clicks on the application background.
   */
  useEffect(() => {
    if (!isActive || isMinimized) return;
    const handleGlobalClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setIsMinimized(true);
      }
    };
    window.addEventListener("click", handleGlobalClick, true);
    return () => window.removeEventListener("click", handleGlobalClick, true);
  }, [isActive, isMinimized]);

  /**
   * 3. Navigation Guard
   * Synchronizes the current page with the tutorial path requirement.
   */
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (pathname !== currentStep.page) {
      setIsChangingPage(true);
      setTargetRect(null); 
      router.push(currentStep.page);
    }
  }, [isActive, currentStep?.page, pathname, router]);

  /**
   * 4. Stabilized Update Highlight
   * Protection against infinite loops by using a 1px movement threshold.
   */
  const updateHighlight = useCallback((shouldScroll = false) => {
    if (!isActive || !currentStep || isMinimized) return;

    const selector = currentSubstep?.highlightSelector ?? currentStep?.highlightSelector;
    if (!selector) {
      if (targetRect) setTargetRect(null);
      setIsChangingPage(false);
      return;
    }

    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      if (targetRect) setTargetRect(null);
      return;
    }

    setIsChangingPage(false);
    const newRect = element.getBoundingClientRect();

    // Check if the element has actually moved significantly (prevent infinite depth error)
    const hasMoved = !targetRect || 
      Math.abs(newRect.top - targetRect.top) > 1 || 
      Math.abs(newRect.left - targetRect.left) > 1 ||
      Math.abs(newRect.width - targetRect.width) > 1;

    if (hasMoved) {
      if (shouldScroll) {
        scrollToTarget(newRect);
      }

      const isBottomRight = newRect.bottom > window.innerHeight - 320 && newRect.right > window.innerWidth - 420;
      setIsOverlayObstructing(isBottomRight);
      setTargetRect(newRect);
    }
  }, [isActive, currentStep, currentSubstep, isMinimized, targetRect, scrollToTarget]);

  /**
   * 5. Filtered Mutation Observer
   * Ignores internal tutorial changes to avoid recursive updates.
   */
  useIsomorphicLayoutEffect(() => {
    if (!isActive || isMinimized) return;

    const observer = new MutationObserver((mutations) => {
      const isInternal = mutations.every(m => 
        overlayRef.current?.contains(m.target) || 
        (m.target as HTMLElement).tagName === 'svg'
      );
      if (isInternal) return;

      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = setTimeout(() => {
        updateHighlight(pathname === currentStep?.page && !targetRect);
      }, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

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
  }, [isActive, isMinimized, currentStepIndex, currentSubstepIndex, updateHighlight, pathname, currentStep?.page, targetRect]);

  if (!isActive || !currentPath || !currentStep) return null;

  const totalUnits = currentPath.steps.reduce((sum, s) => sum + (s.substeps?.length || 1), 0);
  const completedUnits = currentPath.steps.slice(0, currentStepIndex).reduce((sum, s) => sum + (s.substeps?.length || 1), 0) + (currentSubstepIndex + 1);
  const progress = (completedUnits / totalUnits) * 100;

  return (
    <>
      {!isMinimized && !isChangingPage && targetRect && (
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
            className="backdrop-blur-[1px] transition-opacity duration-500"
          />
        </svg>
      )}

      <div
        ref={overlayRef}
        className={clsx(
          "fixed z-50 transition-all duration-500 ease-in-out shadow-2xl rounded-2xl border overflow-hidden",
          isDark ? "bg-[#1c1c16] border-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white border-gray-200 text-gray-900",
          isOverlayObstructing ? "bottom-8 left-8" : "bottom-8 right-8",
          isMinimized ? "w-72" : "w-[400px]"
        )}
      >
        <div className="h-1.5 w-full bg-gray-200/20">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/10 text-blue-500 p-1.5 rounded-lg">
              {(isChangingPage || !targetRect) && !isMinimized ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
              {isMinimized ? "Explore Mode" : (isChangingPage || !targetRect ? "Loading Content..." : currentPath.name)}
            </span>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}>
              {isMinimized ? <ChevronUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-500/20" onClick={() => setShowSkipConfirmation(true)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isMinimized ? (
          <div className="px-4 py-3 flex items-center justify-between bg-blue-500/5 group cursor-pointer" onClick={() => setIsMinimized(false)}>
            <p className="text-xs font-medium opacity-70 group-hover:opacity-100 transition-opacity">Click to resume tutorial</p>
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
        ) : (
          <div className="p-6">
            {(isChangingPage || !targetRect) ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-sm font-medium opacity-60">Synchronizing with page...</p>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-2 leading-tight">{currentStep.title}</h3>
                <p className={clsx("text-sm leading-relaxed mb-6", isDark ? "text-gray-400" : "text-gray-600")}>
                  {currentSubstep?.instruction ?? currentStep.description}
                </p>

                {currentStep.tips && currentStep.tips.length > 0 && (
                  <div className="mb-6 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs italic opacity-80">
                    💡 {currentStep.tips[0]}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); prevStep(); }} disabled={currentStepIndex === 0 && currentSubstepIndex === 0}>
                    <ChevronLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button onClick={(e) => { e.stopPropagation(); nextStep(); }} className="bg-blue-600 hover:bg-blue-500 text-white px-8">
                    {currentStepIndex === currentPath.steps.length - 1 && (!currentStep.substeps || currentSubstepIndex === currentStep.substeps.length - 1) ? "Finish" : "Next"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

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