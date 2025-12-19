import { TutorialPath } from "./tutorials/types"
import { cookingPath } from "./tutorials/cooking"
import { budgetingPath } from "./tutorials/budgeting"
import { healthPath } from "./tutorials/health"

// Re-export types for use in other components
export * from "./tutorials/types"

// Export the main data object
export const tutorialPaths: Record<string, TutorialPath> = {
  cooking: cookingPath,
  budgeting: budgetingPath,
  health: healthPath,
}