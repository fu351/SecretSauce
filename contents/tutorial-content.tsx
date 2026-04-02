// src/contents/tutorial-content.tsx
import { cookingPath } from "./tutorials/cooking"
import { healthPath } from "./tutorials/health"
import { budgetingPath } from "./tutorials/budgeting"
import { generalPages } from "./tutorials/general"

export const tutorialPaths = {
  cooking: cookingPath,
  health: healthPath,
  budgeting: budgetingPath,
}

export { generalPages }

export type { TutorialPath, TutorialStep, TutorialSubstep, GoalRank, RankedGoals, GeneralPageEntry } from "../lib/types/tutorial"