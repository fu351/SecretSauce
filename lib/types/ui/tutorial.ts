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
  action?: 'navigate' | 'click' | 'highlight'
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
