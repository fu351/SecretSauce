export interface TutorialSubstep {
  id: number
  instruction: string
  highlightSelector?: string
  action?: "explore" | "click" | "navigate" | "highlight"
  actionTarget?: string
}

export interface TutorialStep {
  id: number
  title: string
  description: string
  tips?: string[]
  page: string
  highlightSelector?: string
  action?: "navigate" | "click" | "highlight"
  actionTarget?: string
  nextButtonText?: string
  estimatedSeconds?: number
  substeps?: TutorialSubstep[]
}

export interface TutorialPath {
  id: "cooking" | "budgeting" | "health"
  name: string
  description: string
  steps: TutorialStep[]
}