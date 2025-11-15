"use client"

import { useEffect, useRef, useState } from "react"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { ChevronRight, ChevronLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

/**
 * Floating tutorial overlay that guides users through the app
 * Shows on top of pages with highlights and contextual tips
 */
export function TutorialOverlay() {
  const { isActive, currentPath, currentStep, currentStepIndex, nextStep, prevStep, skipTutorial } = useTutorial()
  const { theme } = useTheme()
  const [highlightElement, setHighlightElement] = useState<DOMRect | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const isDark = theme === "dark"

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

  const progress = ((currentStepIndex + 1) / currentPath.steps.length) * 100
  const isLastStep = currentStepIndex === currentPath.steps.length - 1

  // Determine tooltip position based on highlight location
  const getTooltipPosition = () => {
    if (!highlightElement) {
      // Center of screen
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        position: "fixed" as const,
      }
    }

    const tooltipHeight = 300
    const tooltipWidth = 400
    const padding = 20

    // Try to place tooltip above, if not enough space, place below
    if (highlightElement.top > tooltipHeight + padding) {
      return {
        top: highlightElement.top - tooltipHeight - padding,
        left: Math.max(padding, highlightElement.left + highlightElement.width / 2 - tooltipWidth / 2),
        position: "fixed" as const,
      }
    } else {
      return {
        top: highlightElement.bottom + padding,
        left: Math.max(padding, highlightElement.left + highlightElement.width / 2 - tooltipWidth / 2),
        position: "fixed" as const,
      }
    }
  }

  const tooltipStyle = getTooltipPosition()

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
          "fixed z-50 w-96 rounded-lg shadow-2xl border pointer-events-auto transition-all duration-300",
          isDark
            ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]"
            : "bg-white border-gray-200 text-gray-900"
        )}
        style={{
          ...tooltipStyle,
          maxWidth: "calc(100vw - 40px)",
        }}
      >
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div
                className={clsx(
                  "text-xs font-semibold mb-2 tracking-widest uppercase",
                  isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
                )}
              >
                Step {currentStepIndex + 1} of {currentPath.steps.length}
              </div>
              <h3
                className={clsx("text-xl font-serif font-light mb-2", isDark ? "text-[#e8dcc4]" : "text-gray-900")}
              >
                {currentStep.title}
              </h3>
              <p
                className={clsx(
                  "text-sm leading-relaxed",
                  isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
                )}
              >
                {currentStep.description}
              </p>
            </div>
            <button
              onClick={skipTutorial}
              className={clsx(
                "flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity",
                isDark ? "text-[#e8dcc4]/60" : "text-gray-400"
              )}
              aria-label="Close tutorial"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 h-1 bg-gray-300 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#e8dcc4/20" : "#e5e7eb" }}>
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Tips */}
        {currentStep.tips && currentStep.tips.length > 0 && (
          <div className="p-6 border-b" style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}>
            <p
              className={clsx(
                "text-xs font-semibold mb-3 tracking-widest uppercase",
                isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
              )}
            >
              💡 Quick Tips
            </p>
            <ul className="space-y-2">
              {currentStep.tips.map((tip, idx) => (
                <li
                  key={idx}
                  className={clsx(
                    "text-sm",
                    isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
                  )}
                >
                  • {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Estimated Time */}
        {currentStep.estimatedSeconds && (
          <div
            className="px-6 py-3 text-xs text-center"
            style={{ color: isDark ? "#e8dcc4/50" : "#999" }}
          >
            ⏱️ This step takes about {currentStep.estimatedSeconds} seconds
          </div>
        )}

        {/* Actions */}
        <div className="p-6 flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={prevStep}
            disabled={currentStepIndex === 0}
            className={clsx(
              "flex-1",
              isDark
                ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 disabled:opacity-50"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            )}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <Button
            onClick={nextStep}
            className={clsx(
              "flex-1",
              isDark
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-blue-500 text-white hover:bg-blue-600"
            )}
          >
            {isLastStep ? "Complete" : "Next"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Path indicator on left side */}
      <div
        className={clsx(
          "fixed left-4 top-1/2 transform -translate-y-1/2 z-50 space-y-2",
          "hidden lg:block pointer-events-none"
        )}
      >
        {currentPath.steps.map((step, idx) => (
          <div
            key={step.id}
            className={clsx(
              "w-3 h-3 rounded-full transition-all",
              idx < currentStepIndex
                ? isDark
                  ? "bg-blue-600"
                  : "bg-blue-500"
                : idx === currentStepIndex
                  ? isDark
                    ? "bg-blue-400 ring-2 ring-blue-600 ring-offset-2"
                    : "bg-blue-400 ring-2 ring-blue-500 ring-offset-2"
                  : isDark
                    ? "bg-[#e8dcc4]/20"
                    : "bg-gray-300"
            )}
            style={{
              ringColor: isDark ? "#181813" : "white",
            }}
            title={step.title}
          />
        ))}
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
