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

    const isAllowedElement = (target: HTMLElement): boolean => {
      // Allow clicks on tutorial overlay
      if (target.closest("[data-tutorial-overlay]")) {
        return true
      }

      // Allow clicks on highlighted elements
      if (target.closest(".tutorial-highlight")) {
        return true
      }

      // Allow clicks on action target if it's a specific element
      if (currentStep?.actionTarget && currentStep.action === "click") {
        const actionElement = document.querySelector(currentStep.actionTarget)
        if (actionElement && actionElement.contains(target)) {
          return true
        }
      }

      // Allow navigation if it matches the action target
      if (currentStep?.actionTarget && currentStep.action === "navigate") {
        const link = target.closest("a") as HTMLAnchorElement
        if (link && link.href && link.href.includes(currentStep.actionTarget)) {
          return true
        }
      }

      return false
    }

    const handleBlockEvent = (e: Event) => {
      const target = e.target as HTMLElement

      // Allow events on whitelisted elements
      if (isAllowedElement(target)) {
        return
      }

      // Block the event
      e.preventDefault()
      if (e instanceof MouseEvent || e instanceof KeyboardEvent) {
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }

    // Block pointer events (click, mousedown, etc.)
    document.addEventListener("mousedown", handleBlockEvent as EventListener, true)
    document.addEventListener("click", handleBlockEvent as EventListener, true)

    // Block scroll and wheel events
    document.addEventListener("scroll", handleBlockEvent, true)
    document.addEventListener("wheel", handleBlockEvent as EventListener, true)

    // Block keyboard events
    document.addEventListener("keydown", handleBlockEvent as EventListener, true)
    document.addEventListener("keyup", handleBlockEvent as EventListener, true)

    // Block drag and text selection
    document.addEventListener("dragstart", handleBlockEvent as EventListener, true)
    document.addEventListener("selectstart", handleBlockEvent as EventListener, true)
    document.addEventListener("touchstart", handleBlockEvent as EventListener, true)

    return () => {
      document.removeEventListener("mousedown", handleBlockEvent as EventListener, true)
      document.removeEventListener("click", handleBlockEvent as EventListener, true)
      document.removeEventListener("scroll", handleBlockEvent, true)
      document.removeEventListener("wheel", handleBlockEvent as EventListener, true)
      document.removeEventListener("keydown", handleBlockEvent as EventListener, true)
      document.removeEventListener("keyup", handleBlockEvent as EventListener, true)
      document.removeEventListener("dragstart", handleBlockEvent as EventListener, true)
      document.removeEventListener("selectstart", handleBlockEvent as EventListener, true)
      document.removeEventListener("touchstart", handleBlockEvent as EventListener, true)
    }
  }, [isActive, currentStep])

  if (!isActive) return null

  return (
    <div
      ref={blocker}
      className="fixed inset-0 z-30 bg-black/10 pointer-events-none"
      aria-hidden="true"
    />
  )
}
