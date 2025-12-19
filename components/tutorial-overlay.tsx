"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

/**
 * Fixed tutorial overlay that guides users through the app.
 * Sits bottom-right with highlights, tips, and gentle navigation.
 */
export function TutorialOverlay() {
  const { isActive, currentPath, currentStep, currentStepIndex, nextStep, goToStep, skipTutorial } = useTutorial()
  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0)
  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false)

  const isDark = theme === "dark"
  const onCorrectPage = currentStep ? pathname === currentStep.page : false

  const getTargetLabel = (target?: string | null) => {
    switch (target) {
      case "/recipes":
        return "the Recipes page"
      case "/meal-planner":
        return "the Meal Planner"
      case "/shopping":
        return "the Shopping page"
      case "/dashboard":
        return "your Dashboard"
      default:
        return target || "the next section"
    }
  }

  // Substeps support (unused today, but preserved)
  const hasSubsteps = currentStep?.substeps && currentStep.substeps.length > 0
  const currentSubstep = hasSubsteps && currentStep?.substeps ? currentStep.substeps[currentSubstepIndex] : null
  const totalSubsteps = hasSubsteps && currentStep?.substeps ? currentStep.substeps.length : 1
  const activeAction = currentSubstep?.action ?? currentStep?.action ?? "highlight"
  const activeTarget = currentSubstep?.actionTarget ?? currentStep?.actionTarget
  const actionMessage = (() => {
    if (currentStep && !onCorrectPage) {
      return `Go to ${getTargetLabel(currentStep.page)} to see this step.`
    }
    switch (activeAction) {
      case "navigate":
        return `Use the site navigation to open ${getTargetLabel(activeTarget)}.`
      case "click":
        return "Click the highlighted element to continue."
      case "explore":
        return "Explore this area, then use the arrows to navigate."
      case "highlight":
      default:
        return "Review the highlighted area, then use the arrows to navigate."
    }
  })()

  useEffect(() => {
    setCurrentSubstepIndex(0)
  }, [currentStepIndex])

  const handleNextSubstep = () => {
    if (currentSubstepIndex < totalSubsteps - 1) {
      setCurrentSubstepIndex((prev) => prev + 1)
    } else {
      nextStep()
    }
  }

  const findVisibleElement = (selector: string, retryCount = 0): HTMLElement | null => {
    const maxRetries = 3
    const allMatches = document.querySelectorAll(selector)

    for (const element of Array.from(allMatches)) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element as HTMLElement)
      if (rect.height > 0 && rect.width > 0 && style.display !== "none" && style.visibility !== "hidden") {
        return element as HTMLElement
      }
    }

    if (retryCount < maxRetries && allMatches.length === 0) {
      return null
    }

    return null
  }

  // Highlight the target element when on the correct page
  useEffect(() => {
    const highlightSelector = currentSubstep?.highlightSelector || currentStep?.highlightSelector
    if (!highlightSelector || !onCorrectPage) return

    let highlightedElement: HTMLElement | null = null
    let retryAttempt = 0

    const attemptHighlight = () => {
      const element = findVisibleElement(highlightSelector, retryAttempt)
      if (element) {
        highlightedElement = element
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
        }, 100)
        setTimeout(() => {
          element.classList.add("tutorial-highlight")
        }, 300)
      } else if (retryAttempt < 3) {
        retryAttempt++
        const delay = Math.min(1000 * Math.pow(2, retryAttempt - 1), 3000)
        setTimeout(attemptHighlight, delay)
      }
    }

    attemptHighlight()

    return () => {
      if (highlightedElement) {
        highlightedElement.classList.remove("tutorial-highlight")
      }
    }
  }, [currentStep?.highlightSelector, currentSubstep?.highlightSelector, currentSubstepIndex, onCorrectPage])

  if (!isActive || !currentPath || !currentStep) {
    return null
  }

  const isLastStep = currentStepIndex === currentPath.steps.length - 1

  return (
    <>
      <div
        ref={overlayRef}
        className={clsx(
          "fixed z-50 w-80 bottom-6 right-6 rounded-lg shadow-2xl border pointer-events-auto transition-all duration-300",
          isDark ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : "bg-white border-gray-200 text-gray-900"
        )}
        style={{ maxWidth: "calc(100vw - 40px)" }}
        data-tutorial-overlay
      >
        <div className="p-4 border-b" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
          <div className="flex-1">
            <div
              className={clsx(
                "text-xs font-semibold mb-1 tracking-widest uppercase",
                isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
              )}
            >
              Step {currentStepIndex + 1} of {currentPath.steps.length}
              {hasSubsteps && ` · Part ${currentSubstepIndex + 1} of ${totalSubsteps}`}
            </div>
            <h3 className={clsx("text-base font-serif font-light mb-0.5", isDark ? "text-[#e8dcc4]" : "text-gray-900")}>
              {currentStep.title}
            </h3>
            {hasSubsteps ? (
              <>
                <p className={clsx("text-xs", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}>
                  {currentSubstep?.instruction}
                </p>
                <p className={clsx("mt-2 text-xs", isDark ? "text-[#e8dcc4]/50" : "text-gray-500")}>{actionMessage}</p>
              </>
            ) : (
              <>
                {currentStep.description && (
                  <p className={clsx("text-xs", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}>
                    {currentStep.description}
                  </p>
                )}
                <p className={clsx("mt-2 text-xs", isDark ? "text-[#e8dcc4]/50" : "text-gray-500")}>{actionMessage}</p>
                {!onCorrectPage && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={() => router.push(currentStep.page)}
                      className={clsx(
                        "text-xs font-medium",
                        isDark ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-500 text-white hover:bg-blue-600"
                      )}
                    >
                      Go to {getTargetLabel(currentStep.page)}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <Button
            onClick={() => {
              if (currentSubstepIndex > 0) {
                setCurrentSubstepIndex((prev) => prev - 1)
              } else if (currentStepIndex > 0) {
                goToStep(currentStepIndex - 1)
              }
            }}
            disabled={currentStepIndex === 0 && currentSubstepIndex === 0}
            variant="ghost"
            size="sm"
            className={clsx(
              "text-xs font-medium h-8 px-3",
              isDark
                ? "text-[#e8dcc4] hover:bg-[#e8dcc4]/10 disabled:text-[#e8dcc4]/30"
                : "text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
            )}
            title="Previous step"
          >
            Previous
          </Button>

          <div className="flex items-center gap-1.5">
            {currentPath.steps.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(idx)}
                className={clsx(
                  "rounded-full transition-all cursor-pointer hover:scale-110",
                  idx < currentStepIndex
                    ? isDark
                      ? "bg-blue-600 w-2 h-2"
                      : "bg-blue-500 w-2 h-2"
                    : idx === currentStepIndex
                      ? isDark
                        ? "bg-blue-400 w-3 h-3 ring-1 ring-blue-600"
                        : "bg-blue-400 w-3 h-3 ring-1 ring-blue-500"
                      : isDark
                        ? "bg-[#e8dcc4]/20 w-2 h-2"
                        : "bg-gray-300 w-2 h-2"
                )}
                title={`Step ${idx + 1}: ${step.title}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowSkipConfirmation(true)}
              variant="ghost"
              size="sm"
              className={clsx(
                "text-xs font-medium",
                isDark
                  ? "text-[#e8dcc4]/60 hover:text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              )}
              title="Skip tutorial for now"
            >
              Skip
            </Button>
            <Button
              onClick={() => {
                if (!isLastStep || (hasSubsteps && currentSubstepIndex < totalSubsteps - 1)) {
                  handleNextSubstep()
                } else {
                  nextStep()
                }
              }}
              size="sm"
              className={clsx(
                "text-xs font-medium h-8 px-3",
                isDark ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-500 text-white hover:bg-blue-600"
              )}
              title="Next step"
            >
              {isLastStep && !hasSubsteps ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>

      {showSkipConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSkipConfirmation(false)} />
          <div
            className={clsx(
              "relative rounded-lg shadow-2xl p-6 max-w-md w-full",
              isDark ? "bg-[#181813] border border-[#e8dcc4]/30" : "bg-white border border-gray-200"
            )}
          >
            <h2 className={clsx("text-xl font-bold mb-3", isDark ? "text-[#e8dcc4]" : "text-gray-900")}>Skip the tour?</h2>
            <p className={clsx("text-sm mb-6", isDark ? "text-[#e8dcc4]/70" : "text-gray-600")}>
              You can restart anytime from Settings or your dashboard.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowSkipConfirmation(false)}
                variant="outline"
                className={clsx(
                  "flex-1",
                  isDark ? "border-[#e8dcc4]/30 text-[#e8dcc4]" : "border-gray-300 text-gray-700"
                )}
              >
                Continue Tour
              </Button>
              <Button
                onClick={() => {
                  setShowSkipConfirmation(false)
                  skipTutorial()
                }}
                className={clsx(
                  "flex-1",
                  isDark ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-gray-500 text-white hover:bg-gray-600"
                )}
              >
                Skip Tour
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
