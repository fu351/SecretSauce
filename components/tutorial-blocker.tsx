"use client"

import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"

/**
 * Adds a subtle visual tint during the tutorial to focus attention
 * on highlighted elements. Users can still interact with the UI.
 */
export function TutorialBlocker() {
  const { isActive, currentStep } = useTutorial()
  const { theme } = useTheme()

  const isDark = theme === "dark"

  if (!isActive || !currentStep) return null

  return (
    <div
      className={`fixed inset-0 z-30 pointer-events-none transition-all duration-300 ${
        isDark ? "bg-black/20" : "bg-black/10"
      }`}
      aria-hidden="true"
    />
  )
}
