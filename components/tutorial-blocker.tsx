"use client"

import { useEffect, useRef } from "react"
import { useTutorial } from "@/contexts/tutorial-context"

/**
 * Blocks all user interactions while tutorial is active
 * Only allows clicks on:
 * - The tutorial overlay itself
 * - The highlighted element
 * - The action target element
 * - Links/buttons specified in actionTarget
 */
export function TutorialBlocker() {
  const { isActive, currentStep } = useTutorial()
  const blocker = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isActive) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Allow clicks on tutorial overlay
      if (target.closest("[data-tutorial-overlay]")) {
        return
      }

      // Allow clicks on highlighted elements
      if (target.closest(".tutorial-highlight")) {
        return
      }

      // Allow clicks on action target if it's a specific element
      if (currentStep?.actionTarget && currentStep.action === "click") {
        const actionElement = document.querySelector(currentStep.actionTarget)
        if (actionElement && actionElement.contains(target)) {
          return
        }
      }

      // Allow navigation if it matches the action target
      if (currentStep?.actionTarget && currentStep.action === "navigate") {
        const link = target.closest("a") as HTMLAnchorElement
        if (link && link.href && link.href.includes(currentStep.actionTarget)) {
          return
        }
      }

      // Block all other interactions
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }

    // Add blocker listener with capture phase
    document.addEventListener("mousedown", handleMouseDown, true)
    document.addEventListener("click", handleMouseDown, true)

    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true)
      document.removeEventListener("click", handleMouseDown, true)
    }
  }, [isActive, currentStep])

  if (!isActive) return null

  return (
    <div
      ref={blocker}
      className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm pointer-events-none"
      aria-hidden="true"
    />
  )
}
