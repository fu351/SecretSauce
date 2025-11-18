"use client"

import { useEffect, useRef, useState } from "react" // useState used for showHint
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

/**
 * Fixed tutorial overlay that guides users through the app
 * Positioned at bottom-right of screen with highlights and contextual tips
 * Includes horizontal progress dots and skip button
 */
export function TutorialOverlay() {
  const { isActive, currentPath, currentStep, currentStepIndex, nextStep, goToStep, skipTutorial } = useTutorial()
  const { theme } = useTheme()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0)

  const isDark = theme === "dark"
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

  // Get current substep if available, otherwise use main step
  const hasSubsteps = currentStep?.substeps && currentStep.substeps.length > 0
  const currentSubstep = hasSubsteps && currentStep?.substeps ? currentStep.substeps[currentSubstepIndex] : null
  const totalSubsteps = hasSubsteps && currentStep?.substeps ? currentStep.substeps.length : 1
  const activeAction = currentSubstep?.action ?? currentStep?.action ?? "highlight"
  const activeTarget = currentSubstep?.actionTarget ?? currentStep?.actionTarget
  const actionMessage = (() => {
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

  // Reset substep index when main step changes
  useEffect(() => {
    setCurrentSubstepIndex(0)
  }, [currentStepIndex])

  // Handle advancing to next substep or main step
  const handleNextSubstep = () => {
    if (currentSubstepIndex < totalSubsteps - 1) {
      // Move to next substep
      setCurrentSubstepIndex((prev) => prev + 1)
    } else {
      // All substeps done, move to next main step
      nextStep()
    }
  }

  // Helper function to find visible element matching selector with retries
  const findVisibleElement = (selector: string, retryCount = 0): HTMLElement | null => {
    const maxRetries = 3
    const allMatches = document.querySelectorAll(selector)

    console.log(`[Tutorial] Finding element: "${selector}", found ${allMatches.length} matches, retry ${retryCount}/${maxRetries}`)

    // Check each matching element for visibility
    for (const element of Array.from(allMatches)) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element as HTMLElement)

      // Element is visible if it has dimensions
      if (rect.height > 0 && rect.width > 0) {
        // Ensure element is not explicitly hidden
        if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          console.log(`[Tutorial] Found visible element for "${selector}"`)
          return element as HTMLElement
        }
      }
    }

    // If no perfectly visible element found, return first match with dimensions
    // This helps with elements that might be slightly off-screen or have opacity transitions
    for (const element of Array.from(allMatches)) {
      const rect = element.getBoundingClientRect()
      if (rect.height > 0 && rect.width > 0) {
        const style = window.getComputedStyle(element as HTMLElement)
        if (style.display !== "none") {
          console.log(`[Tutorial] Found element with dimensions for "${selector}" (fallback)`)
          return element as HTMLElement
        }
      }
    }

    // If element not found and we haven't exceeded retries, try again after a delay
    if (retryCount < maxRetries && allMatches.length === 0) {
      console.log(`[Tutorial] Element "${selector}" not found, will retry...`)
      return null
    }

    console.warn(`[Tutorial] Could not find visible element for selector: "${selector}"`)
    return null
  }

  // Find and highlight the target element (use substep selector if available)
  useEffect(() => {
    const highlightSelector = currentSubstep?.highlightSelector || currentStep?.highlightSelector

    if (!highlightSelector) {
      return
    }

    let highlightedElement: HTMLElement | null = null
    let retryAttempt = 0

    // Retry function with exponential backoff
    const attemptHighlight = () => {
      const element = findVisibleElement(highlightSelector, retryAttempt)

      if (element) {
        highlightedElement = element

        // Scroll element into view with better positioning
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
        }, 100)

        // Add visual focus to the element (outline and pulsing animation applied via CSS class)
        setTimeout(() => {
          element.classList.add("tutorial-highlight")
        }, 300)
      } else if (retryAttempt < 3) {
        // Retry with exponential backoff
        retryAttempt++
        const delay = Math.min(1000 * Math.pow(2, retryAttempt - 1), 3000)
        console.log(`[Tutorial] Retrying highlight in ${delay}ms...`)
        setTimeout(attemptHighlight, delay)
      }
    }

    attemptHighlight()

    return () => {
      if (highlightedElement) {
        highlightedElement.classList.remove("tutorial-highlight")
      }
    }
  }, [currentStep?.highlightSelector, currentSubstep?.highlightSelector, currentSubstepIndex])


  if (!isActive || !currentPath || !currentStep) {
    return null
  }

  const isLastStep = currentStepIndex === currentPath.steps.length - 1

  return (
    <>
      {/* Tutorial Overlay Tooltip */}
      <div
        ref={overlayRef}
        className={clsx(
          "fixed z-50 w-80 bottom-6 right-6 rounded-lg shadow-2xl border pointer-events-auto transition-all duration-300",
          isDark
            ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]"
            : "bg-white border-gray-200 text-gray-900"
        )}
        style={{
          maxWidth: "calc(100vw - 40px)",
        }}
        data-tutorial-overlay
      >
        {/* Header */}
        <div
          className="p-4 border-b"
          style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}
        >
          <div className="flex-1">
            <div
              className={clsx(
                "text-xs font-semibold mb-1 tracking-widest uppercase",
                isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
              )}
            >
              Step {currentStepIndex + 1} of {currentPath.steps.length}
              {hasSubsteps && ` • Part ${currentSubstepIndex + 1} of ${totalSubsteps}`}
            </div>
            <h3
              className={clsx("text-base font-serif font-light mb-0.5", isDark ? "text-[#e8dcc4]" : "text-gray-900")}
            >
              {currentStep.title}
            </h3>
            {hasSubsteps ? (
              <>
                <p
                  className={clsx("text-xs", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}
                >
                  {currentSubstep?.instruction}
                </p>
                <p
                  className={clsx("mt-2 text-xs", isDark ? "text-[#e8dcc4]/50" : "text-gray-500")}
                >
                  {actionMessage}
                </p>
              </>
            ) : (
              <>
                {currentStep.description && (
                  <p
                    className={clsx("text-xs", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}
                  >
                    {currentStep.description}
                  </p>
                )}
                <p
                  className={clsx("mt-2 text-xs", isDark ? "text-[#e8dcc4]/50" : "text-gray-500")}
                >
                  {actionMessage}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Navigation and Progress Dots */}
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          {/* Previous Arrow */}
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
              "text-xs font-medium h-8 w-8 p-0",
              isDark
                ? "text-[#e8dcc4] hover:bg-[#e8dcc4]/10 disabled:text-[#e8dcc4]/30"
                : "text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
            )}
            title="Previous step"
          >
            &lt;
          </Button>

          {/* Horizontal Progress Dots - Clickable */}
          <div className="flex items-center gap-1.5">
            {currentPath.steps.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  goToStep(idx)
                }}
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

          {/* Close/Next Arrow */}
          <div className="flex items-center gap-2">
            <Button
              onClick={skipTutorial}
              variant="ghost"
              size="sm"
              className={clsx(
                "text-xs font-medium",
                isDark
                  ? "text-[#e8dcc4]/60 hover:text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              )}
              title="Close tutorial"
            >
              ✕
            </Button>
            <Button
              onClick={() => {
                if (!isLastStep || (hasSubsteps && currentSubstepIndex < totalSubsteps - 1)) {
                  handleNextSubstep()
                } else {
                  nextStep()
                }
              }}
              variant="ghost"
              size="sm"
              className={clsx(
                "text-xs font-medium h-8 w-8 p-0",
                isDark
                  ? "text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
                  : "text-gray-700 hover:bg-gray-100"
              )}
              title="Next step"
            >
              &gt;
            </Button>
          </div>
        </div>
      </div>


      {/* CSS for highlight effect */}
      <style>{`
        @keyframes pulse-highlight {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.8);
          }
          50% {
            box-shadow: 0 0 0 12px rgba(59, 130, 246, 0);
          }
        }

        .tutorial-highlight {
          animation: pulse-highlight 2s infinite !important;
          outline: 3px solid #3b82f6 !important;
          outline-offset: 4px !important;
          position: relative !important;
          z-index: 1000 !important;
        }
      `}</style>
    </>
  )
}
