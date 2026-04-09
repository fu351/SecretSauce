/**
 * Tutorial Substep Type
 *
 * A micro-step within a tutorial step that guides users through specific UI interactions.
 * Includes highlighting and action specifications for automated guidance.
 */
export interface TutorialSubstep {
  id: number
  instruction: string
  highlightSelector?: string
  scrollContainerSelector?: string
  completionSelector?: string
  action?: "explore" | "click" | "navigate" | "highlight" | "search"
  actionTarget?: string
  /** If true, this substep only appears on mobile-sized layouts. */
  mobileOnly?: boolean
  /** If true, this substep only appears on desktop-sized layouts. */
  desktopOnly?: boolean
  /** If true, the user must interact with the highlighted element before Next is enabled. */
  mandatory?: boolean
  /** If true, pointer events on the highlighted element are blocked (display-only highlight). */
  blockClick?: boolean
}

/**
 * General page-level tutorial content used for the shared walkthrough.
 * Each entry owns the top-to-bottom guidance for a single page.
 */
export interface GeneralPageEntry {
  page: string
  title: string
  description: string
  substeps: TutorialSubstep[]
  /** Substeps appended after the main page walkthrough for this page. */
  postSubsteps?: TutorialSubstep[]
}
