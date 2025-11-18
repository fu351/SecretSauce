"use client"

import { useEffect, useRef, useState } from "react" // useState used for showHint
import { usePathname } from "next/navigation"
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
  const pathname = usePathname()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [showHint, setShowHint] = useState(false)
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
  const currentSubstep = hasSubsteps ? currentStep.substeps[currentSubstepIndex] : null
  const totalSubsteps = hasSubsteps ? currentStep.substeps.length : 1
  const activeAction = currentSubstep?.action ?? currentStep?.action ?? "highlight"
  const activeTarget = currentSubstep?.actionTarget ?? currentStep?.actionTarget
  const actionMessage = (() => {
    switch (activeAction) {
      case "navigate":
        return `Use the site navigation to open ${getTargetLabel(activeTarget)}. We'll move you to the next step when you arrive.`
      case "click":
        return "Click the highlighted element to continue. You can interact with it freely before pressing Next."
      case "explore":
        return "Scroll, hover, or click around this area to get familiar with it. When you're ready, press Next."
      case "highlight":
      default:
        return "Focus on the highlighted area. You can interact with it, then press Next to keep going."
    }
  })()
  const nextButtonTooltip = (() => {
    switch (activeAction) {
      case "navigate":
        return `After you open ${getTargetLabel(activeTarget)}, we'll advance automatically.`
      case "click":
        return "Use the highlighted control, then press Next to continue."
      case "explore":
        return "Take your time exploring. When you're done, click Next."
      case "highlight":
      default:
        return "Review this area, then hit Next whenever you're ready."
    }
  })()

  // Auto-advance when user navigates to the next step's required page
  useEffect(() => {
    if (!currentStep) return

    // Only auto-advance if the action is "navigate" and we've reached the target page
    if (currentStep.action === "navigate" && currentStep.page && pathname === currentStep.page) {
      const timer = setTimeout(() => {
        nextStep()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [pathname, currentStep, nextStep])

  // Reset substep index when main step changes
  useEffect(() => {
    setCurrentSubstepIndex(0)
  }, [currentStepIndex])

  // Show hint after 5 seconds of inactivity on a step
  useEffect(() => {
    setShowHint(false)
    const hintTimer = setTimeout(() => {
      setShowHint(true)
    }, 5000)
    return () => clearTimeout(hintTimer)
  }, [currentStepIndex, currentSubstepIndex])

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

  // Helper function to find visible element matching selector
  const findVisibleElement = (selector: string): HTMLElement | null => {
    const allMatches = document.querySelectorAll(selector)

    // Check each matching element for visibility
    for (const element of Array.from(allMatches)) {
      const rect = element.getBoundingClientRect()

      // Element is visible if it has dimensions and is within viewport or scrollable area
      if (rect.height > 0 && rect.width > 0) {
        // Additional check: ensure element or parent is not hidden via display/visibility
        const style = window.getComputedStyle(element as HTMLElement)
        if (style.display !== "none" && style.visibility !== "hidden") {
          return element as HTMLElement
        }
      }
    }

    return null
  }

  // Find and highlight the target element (use substep selector if available)
  useEffect(() => {
    const highlightSelector = currentSubstep?.highlightSelector || currentStep?.highlightSelector

    if (!highlightSelector) {
      return
    }

    // Find first visible element matching the selector
    const element = findVisibleElement(highlightSelector)
    if (!element) return

    // Scroll element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" })

    // Add visual focus to the element (outline and pulsing animation applied via CSS class)
    element.classList.add("tutorial-highlight")

    return () => {
      element.classList.remove("tutorial-highlight")
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

        {/* Tips */}
        {currentStep.tips && currentStep.tips.length > 0 && (
          <div className="px-4 py-3 border-b" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
            <ul className="space-y-0.5">
              {currentStep.tips.map((tip, idx) => (
                <li
                  key={idx}
                  className={clsx(
                    "text-xs",
                    isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
                  )}
                >
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Instructions */}
        <div className="px-4 py-3 border-t" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
          {showHint && (
            <p
              className={clsx("text-xs mt-2 p-2 rounded", isDark ? "bg-blue-600/20 text-blue-300" : "bg-blue-50 text-blue-700")}
            >
              {hasSubsteps
                ? "Work through each part above, then press Next."
                : activeAction === "navigate"
                  ? `Use the navigation to open ${getTargetLabel(activeTarget)}. We'll advance automatically.`
                  : "Interact with the highlighted section, then press Next. You can also jump with the progress dots."}
            </p>
          )}
        </div>

        {/* Navigation and Progress Dots */}
        <div className="px-4 py-4 flex items-center justify-between gap-3">
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
          >
            Skip Tutorial
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

          <div className="relative group">
            {!isLastStep || (hasSubsteps && currentSubstepIndex < totalSubsteps - 1) ? (
              <Button
                onClick={handleNextSubstep}
                size="sm"
                className={clsx(
                  "text-xs font-medium",
                  isDark ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-500 text-white hover:bg-blue-600"
                )}
              >
                {hasSubsteps ? `Next (${currentSubstepIndex + 1}/${totalSubsteps})` : "Next"}
              </Button>
            ) : isLastStep ? (
              <Button
                onClick={nextStep}
                size="sm"
                className={clsx(
                  "text-xs font-medium",
                  isDark ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-500 text-white hover:bg-blue-600"
                )}
              >
                Done
              </Button>
            ) : null}
            <span
              className={clsx(
                "pointer-events-none absolute bottom-full right-1/2 translate-x-1/2 mb-2 w-48 rounded-md px-3 py-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 shadow-lg border",
                isDark ? "bg-[#0f172a] text-white border-white/10" : "bg-white text-gray-700 border-gray-200"
              )}
            >
              {nextButtonTooltip}
            </span>
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
