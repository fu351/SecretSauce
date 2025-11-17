"use client"

import { useEffect, useRef, useState } from "react"
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
  const { isActive, currentPath, currentStep, currentStepIndex, nextStep, skipTutorial } = useTutorial()
  const { theme } = useTheme()
  const pathname = usePathname()
  const [highlightElement, setHighlightElement] = useState<DOMRect | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [stepCompleted, setStepCompleted] = useState(false)

  const isDark = theme === "dark"

  // Auto-advance when step is completed or page changes to next step's page
  useEffect(() => {
    if (!currentStep) return

    // Check if we've navigated to the required page
    if (currentStep.page && pathname === currentStep.page && !stepCompleted) {
      setStepCompleted(true)
      // Auto-advance after a short delay to let user see they're on the right page
      const timer = setTimeout(() => {
        nextStep()
        setStepCompleted(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [pathname, currentStep, stepCompleted, nextStep])

  // Find and highlight the target element
  useEffect(() => {
    if (!currentStep?.highlightSelector) {
      setHighlightElement(null)
      return
    }

    const element = document.querySelector(currentStep.highlightSelector)
    if (element) {
      const rect = element.getBoundingClientRect()
      setHighlightElement(rect)

      // Scroll element into view
      element.scrollIntoView({ behavior: "smooth", block: "center" })

      // Add visual focus to the element
      element.classList.add("tutorial-highlight")

      return () => {
        element.classList.remove("tutorial-highlight")
      }
    }
  }, [currentStep?.highlightSelector])


  if (!isActive || !currentPath || !currentStep) {
    return null
  }

  const isLastStep = currentStepIndex === currentPath.steps.length - 1

  return (
    <>
      {/* Backdrop with highlight cutout */}
      {highlightElement && (
        <div
          className="fixed inset-0 z-40 pointer-events-none"
          style={{
            background: "radial-gradient(circle, transparent 20%, rgba(0,0,0,0.7) 100%)",
          }}
        >
          <div
            className="absolute border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] rounded-lg transition-all duration-300"
            style={{
              top: highlightElement.top - 8,
              left: highlightElement.left - 8,
              width: highlightElement.width + 16,
              height: highlightElement.height + 16,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.7), inset 0 0 0 2px #60a5fa",
            }}
          />
        </div>
      )}

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
            </div>
            <h3
              className={clsx("text-base font-serif font-light mb-0.5", isDark ? "text-[#e8dcc4]" : "text-gray-900")}
            >
              {currentStep.title}
            </h3>
            {currentStep.description && (
              <p
                className={clsx(
                  "text-xs",
                  isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
                )}
              >
                {currentStep.description}
              </p>
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
        {stepCompleted ? (
          <div className="px-4 py-2 bg-blue-500/10 border-t" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
            <p className={clsx("text-xs font-medium", isDark ? "text-blue-300" : "text-blue-600")}>
              Loading next step...
            </p>
          </div>
        ) : (
          <div className="px-4 py-2 border-t" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
            <p
              className={clsx("text-xs leading-relaxed", isDark ? "text-[#e8dcc4]/70" : "text-gray-600")}
            >
              {currentStep.action === "navigate"
                ? `Navigate to ${currentStep.actionTarget === "/recipes" ? "Recipes" : currentStep.actionTarget === "/meal-plan" ? "Meal Planner" : currentStep.actionTarget === "/shopping" ? "Shopping" : currentStep.actionTarget === "/dashboard" ? "Dashboard" : currentStep.actionTarget}. You'll automatically advance to the next step.`
                : currentStep.action === "click"
                  ? "Click the highlighted area to continue."
                  : "Explore this section and get familiar with the features."}
            </p>
          </div>
        )}

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
            Skip
          </Button>

          {/* Horizontal Progress Dots */}
          <div className="flex items-center gap-1.5">
            {currentPath.steps.map((step, idx) => (
              <div
                key={step.id}
                className={clsx(
                  "rounded-full transition-all",
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
                title={step.title}
              />
            ))}
          </div>

          {isLastStep && (
            <Button
              onClick={nextStep}
              size="sm"
              className={clsx(
                "text-xs font-medium",
                isDark
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              )}
            >
              Done
            </Button>
          )}
        </div>
      </div>


      {/* CSS for highlight effect */}
      <style>{`
        @keyframes pulse-highlight {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
          }
        }

        .tutorial-highlight {
          animation: pulse-highlight 2s infinite;
          outline: 2px solid #3b82f6;
          outline-offset: 4px;
          border-radius: 0.5rem;
        }
      `}</style>
    </>
  )
}
