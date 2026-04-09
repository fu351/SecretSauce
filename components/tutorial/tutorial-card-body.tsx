"use client"

import {
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TutorialSubstep, GeneralPageEntry } from "@/lib/types/ui/tutorial"
import { findFirstVisibleElement } from "@/lib/tutorial-utils"
import clsx from "clsx"

interface TutorialCardBodyProps {
  // State flags
  isMinimized: boolean
  isPageLoading: boolean
  isChangingPage: boolean
  hasSyncTimedOut: boolean
  isPageTransition: boolean
  isWildcardTransition: boolean
  showScrollPrompt: boolean
  isMandatoryCompleted: boolean
  isLastStep: boolean

  // Data
  currentStep: GeneralPageEntry | null | undefined
  currentSubstep: TutorialSubstep | null | undefined
  currentSlotIndex: number
  nextSlot: FlatTutorialSlot | null
  totalSteps: number
  completedSteps: number
  expectedSelector: string | null
  targetRect: DOMRect | null
  syncRetries: number
  pathname: string
  isMobile: boolean
  isDark: boolean

  // Scroll prompt
  scrollPromptLabel: string
  scrollPromptDirectionUp: boolean
  targetElement: HTMLElement | null
  activeScrollContainer: HTMLElement | null

  // Actions
  prevStep: () => void
  nextStep: () => void
  handleGoToExpectedPage: () => void
  onRetryHighlight: () => void
  onScrollToTarget: (
    element: HTMLElement,
    container?: HTMLElement | null
  ) => void
  pendingNextAutoScrollRef: React.MutableRefObject<boolean>
  shouldAutoScrollNextWithinPage: boolean

  // Style helpers
  overlayBodyClass: string
  overlayDualActionClass: string
  overlayActionRowClass: string
}

const PAGE_NAMES: Record<string, string> = {
  "/recipes": "Recipes",
  "/meal-planner": "Meal Planner",
  "/store": "Shopping",
  "/settings": "Settings",
  "/dashboard": "Dashboard",
  "/home": "Home",
}

const MAX_RETRIES = 15

export function TutorialCardBody({
  isMinimized,
  isPageLoading,
  isChangingPage,
  hasSyncTimedOut,
  isPageTransition,
  isWildcardTransition,
  showScrollPrompt,
  isMandatoryCompleted,
  isLastStep,
  currentStep,
  currentSubstep,
  currentSlotIndex,
  nextSlot,
  totalSteps,
  completedSteps,
  expectedSelector,
  targetRect,
  syncRetries,
  isMobile,
  isDark,
  scrollPromptLabel,
  scrollPromptDirectionUp,
  targetElement,
  activeScrollContainer,
  prevStep,
  nextStep,
  handleGoToExpectedPage,
  onRetryHighlight,
  onScrollToTarget,
  pendingNextAutoScrollRef,
  shouldAutoScrollNextWithinPage,
  overlayBodyClass,
  overlayDualActionClass,
  overlayActionRowClass,
  pathname,
}: TutorialCardBodyProps) {
  return (
    <div className={overlayBodyClass}>
      {isMinimized ? (
        // Minimized state — shown inside the minimized card click-to-resume area
        null
      ) : isPageLoading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <p className="text-sm font-medium opacity-60">
            Waiting for page to load...
          </p>
        </div>
      ) : isChangingPage ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <p className="text-sm font-medium opacity-60">Preparing next step...</p>
        </div>
      ) : !!expectedSelector && !targetRect && !hasSyncTimedOut ? (
        // Scanning state
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <p className="text-sm font-medium opacity-70">Scanning for element…</p>
          <p className="text-[10px] opacity-40 mt-1">
            Attempt {syncRetries + 1} of {MAX_RETRIES}
          </p>
        </div>
      ) : hasSyncTimedOut ? (
        // Timeout / error state
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
          <h4 className="font-bold text-lg mb-1">We lost track</h4>
          {currentStep?.page && currentStep.page !== pathname ? (
            <>
              <p className="text-xs opacity-60 mb-1">Not on the right page?</p>
              <p className="text-[10px] opacity-40 mb-6">
                Expected:{" "}
                <span className="font-mono">{currentStep?.page}</span> ·
                Current: <span className="font-mono">{pathname}</span>
              </p>
              <div className={overlayDualActionClass}>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleGoToExpectedPage}
                >
                  Go There
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-blue-600"
                  onClick={nextStep}
                >
                  Continue Anyway
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs opacity-60 mb-2">
                We couldn't find the UI element for this step.
              </p>
              <p className="text-[10px] opacity-40 mb-6">
                Step {completedSteps} of {totalSteps}
                {expectedSelector ? (
                  <>
                    {" "}
                    · Selector:{" "}
                    <span className="font-mono">{expectedSelector}</span>
                  </>
                ) : null}
              </p>
              <div className={overlayDualActionClass}>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={onRetryHighlight}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-blue-600"
                  onClick={nextStep}
                >
                  Continue Anyway
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        // Normal step content
        <>
          <p
            className={clsx(
              "text-[11px] uppercase tracking-[0.18em] mb-2 font-semibold",
              isDark ? "text-[#e8dcc4]/55" : "text-gray-500"
            )}
          >
            Step {completedSteps} of {totalSteps}
          </p>
          <h3 className="text-xl font-bold mb-2 leading-tight">
            {currentStep?.title}
          </h3>
          <p
            className={clsx(
              "text-sm leading-relaxed mb-6",
              isDark ? "text-gray-400" : "text-gray-600"
            )}
          >
            {isPageTransition
              ? `You're done here. Use the navigation ${isMobile ? "below" : "above"} to go to ${PAGE_NAMES[nextSlot!.page] ?? nextSlot!.page}.`
              : isWildcardTransition
              ? `You're done here. ${currentSubstep?.instruction ?? "Click a card to continue to the next step."}`
              : currentSubstep?.instruction ?? currentStep?.description}
          </p>

          {showScrollPrompt ? (
            <button
              onClick={() => {
                if (!targetElement) return
                onScrollToTarget(targetElement, activeScrollContainer)
              }}
              className={clsx(
                "w-full flex items-center gap-3 rounded-xl border px-4 py-3 animate-bounce transition-colors",
                isDark
                  ? "border-blue-400/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                {scrollPromptDirectionUp ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
              <span className="text-sm font-medium">{scrollPromptLabel}</span>
            </button>
          ) : isPageTransition ? (
            <div
              className={clsx(
                "flex items-center gap-3 rounded-xl px-4 py-3 border",
                isDark
                  ? "bg-blue-500/10 border-blue-400/25 text-blue-300"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              )}
            >
              <ChevronUp className="w-4 h-4 shrink-0" />
              <p className="text-xs font-medium leading-snug">
                Click{" "}
                <strong>
                  {PAGE_NAMES[nextSlot!.page] ?? nextSlot!.page}
                </strong>{" "}
                in the navigation {isMobile ? "below" : "above"} to continue
              </p>
            </div>
          ) : isWildcardTransition ? (
            <div
              className={clsx(
                "flex items-center gap-3 rounded-xl px-4 py-3 border",
                isDark
                  ? "bg-blue-500/10 border-blue-400/25 text-blue-300"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              )}
            >
              <ChevronRight className="w-4 h-4 shrink-0" />
              <p className="text-xs font-medium leading-snug">
                Click <strong>any recipe card</strong> above to continue
              </p>
            </div>
          ) : (
            <div className={overlayActionRowClass}>
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                disabled={currentSlotIndex === 0}
                className={isMobile ? "flex-1 justify-center" : undefined}
              >
                <ChevronLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button
                disabled={!!currentSubstep?.mandatory && !isMandatoryCompleted}
                onClick={() => {
                  if (
                    currentSubstep?.action === "click" &&
                    expectedSelector
                  ) {
                    const el = findFirstVisibleElement(expectedSelector)
                    if (el) el.click()
                  }
                  pendingNextAutoScrollRef.current =
                    shouldAutoScrollNextWithinPage
                  nextStep()
                }}
                className={clsx(
                  "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed",
                  isMobile ? "flex-1" : "px-8"
                )}
              >
                {isLastStep ? "Finish" : "Next"}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
