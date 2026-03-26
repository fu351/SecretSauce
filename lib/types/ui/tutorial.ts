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
  action?: 'explore' | 'click' | 'navigate' | 'highlight' | 'search'
  actionTarget?: string
  /** If true, this substep is shown even at rank 3 (minimal depth). */
  essential?: boolean
}

/**
 * Tutorial Step Type
 *
 * A major step in a tutorial path that guides users through a feature or workflow.
 * Can be broken down into substeps for more granular guidance.
 *
 * @example
 * const step: TutorialStep = {
 *   id: 1,
 *   title: "Search for Recipes",
 *   description: "Learn how to search for recipes by cuisine or ingredients",
 *   page: "/recipes",
 *   highlightSelector: ".search-input",
 *   action: "click",
 *   estimatedSeconds: 60
 * }
 */
export interface TutorialStep {
  id: number
  title: string
  description: string
  tips?: string[]
  page: string
  highlightSelector?: string
  action?: 'navigate' | 'click' | 'highlight' | 'explore'
  actionTarget?: string
  nextButtonText?: string
  estimatedSeconds?: number
  substeps?: TutorialSubstep[]
}

/**
 * Tutorial Path Type
 *
 * A complete tutorial flow guiding users through related features or workflows.
 * Users can select which tutorial path to follow based on their interests.
 *
 * @example
 * const path: TutorialPath = {
 *   id: "cooking",
 *   name: "Learn to Cook",
 *   description: "Master the basics of cooking with our guided tutorial",
 *   steps: [{...}, {...}]
 * }
 */
export interface TutorialPath {
  id: 'cooking' | 'budgeting' | 'health'
  name: string
  description: string
  steps: TutorialStep[]
}

/**
 * The rank a path occupies in the user's session.
 * Rank 1 = primary (full depth), rank 2 = reduced, rank 3 = minimal.
 */
export type GoalRank = 1 | 2 | 3

/**
 * The ordered session: 1–3 path IDs where index 0 = rank 1.
 * A single-element array runs only that path (used by the manual track picker).
 * A 3-element array runs all paths in ranked order (used by onboarding drag-to-rank).
 */
export type RankedGoals = ('cooking' | 'budgeting' | 'health')[]
