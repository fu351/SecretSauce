"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { ChevronLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

/**
 * Floating tutorial overlay that guides users through the app
 * Shows on top of pages with highlights and contextual tips
 * Draggable and activity-based navigation
 */
export function TutorialOverlay() {
  const { isActive, currentPath, currentStep, currentStepIndex, nextStep, prevStep, skipTutorial } = useTutorial()
  const { theme } = useTheme()
  const pathname = usePathname()
  const [highlightElement, setHighlightElement] = useState<DOMRect | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
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

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow dragging from the header area
    if (!(e.target as HTMLElement).closest("[data-tutorial-header]")) {
      return
    }

    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    }
  }

  useEffect(() => {
    if (!isDragging) return

    let animationFrameId: number

    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(() => {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y

        setPosition({
          x: dragStartRef.current.offsetX + deltaX,
          y: dragStartRef.current.offsetY + deltaY,
        })
      })
    }

    const handleMouseUp = () => {
      cancelAnimationFrame(animationFrameId)
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      cancelAnimationFrame(animationFrameId)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  if (!isActive || !currentPath || !currentStep) {
    return null
  }

  const progress = ((currentStepIndex + 1) / currentPath.steps.length) * 100
  const isLastStep = currentStepIndex === currentPath.steps.length - 1

  // Determine tooltip position based on highlight location
  const getTooltipPosition = () => {
    const tooltipHeight = 300
    const tooltipWidth = 400
    const padding = 20

    if (!highlightElement) {
      // Center of screen
      return {
        top: `calc(50vh - ${tooltipHeight / 2}px + ${position.y}px)`,
        left: `calc(50vw - ${tooltipWidth / 2}px + ${position.x}px)`,
        position: "fixed" as const,
      }
    }

    // Try to place tooltip above, if not enough space, place below
    const useAbove = highlightElement.top > tooltipHeight + padding
    const top = useAbove
      ? highlightElement.top - tooltipHeight - padding + position.y
      : highlightElement.bottom + padding + position.y
    const left = Math.max(padding, highlightElement.left + highlightElement.width / 2 - tooltipWidth / 2 + position.x)

    return {
      top,
      left,
      position: "fixed" as const,
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
        onMouseDown={handleMouseDown}
        className={clsx(
          "fixed z-50 w-80 rounded-lg shadow-2xl border pointer-events-auto transition-all duration-300",
          isDark
            ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]"
            : "bg-white border-gray-200 text-gray-900",
          isDragging && "cursor-grabbing"
        )}
        style={{
          ...tooltipStyle,
          maxWidth: "calc(100vw - 40px)",
        }}
        data-tutorial-overlay
      >
        {/* Header */}
        <div
          className="p-4 border-b cursor-grab hover:opacity-80 transition-opacity"
          style={{ borderColor: isDark ? "#e8dcc4/20" : "#f0f0f0" }}
          data-tutorial-header
        >
          <div className="flex items-start justify-between gap-3">
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
            <button
              onClick={skipTutorial}
              className={clsx(
                "flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity",
                isDark ? "text-[#e8dcc4]/60" : "text-gray-400"
              )}
              aria-label="Close tutorial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 h-0.5 bg-gray-300 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#e8dcc4/20" : "#e5e7eb" }}>
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
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

        {/* Navigation */}
        <div className="px-4 py-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={prevStep}
            disabled={currentStepIndex === 0}
            className={clsx(
              isDark
                ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 disabled:opacity-50"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            )}
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>

          {isLastStep && (
            <Button
              onClick={nextStep}
              size="sm"
              className={clsx(
                "flex-1",
                isDark
                  ? "bg-blue-600 text-white hover:bg-blue-700 text-xs"
                  : "bg-blue-500 text-white hover:bg-blue-600 text-xs"
              )}
            >
              Done
            </Button>
          )}
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
