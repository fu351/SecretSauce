// src/contents/tutorial-content.tsx
import { cookingPath } from "./tutorials/cooking"
import { healthPath } from "./tutorials/health"
import { budgetingPath } from "./tutorials/budgeting"

export const tutorialPaths = {
  cooking: cookingPath,
  health: healthPath,
  budgeting: budgetingPath,
}

export type { TutorialPath, TutorialStep, TutorialSubstep } from "../lib/types/tutorial"