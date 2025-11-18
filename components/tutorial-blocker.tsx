"use client"

import { useTutorial } from "@/contexts/tutorial-context"

/**
 * Leaves a subtle tint behind the tutorial overlay but no longer prevents
 * interacting with the underlying UI. Users can freely click and explore.
 */
export function TutorialBlocker() {
  const { isActive } = useTutorial()

  if (!isActive) return null

  return <div className="fixed inset-0 z-30 bg-black/10 pointer-events-none" aria-hidden="true" />
}
