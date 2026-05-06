import type { GeneralPageEntry } from "../../types/tutorial"
import { dashboardTutorial } from "./general/dashboard"
import { homeSearchTutorial, homeWrapUpTutorial } from "./general/home"
import { mealPlannerTutorial } from "./general/meal-planner"
import { recipeDetailTutorial, recipeLibraryTutorial } from "./general/recipes"
import { storeTutorial } from "./general/store"

export const generalPages: GeneralPageEntry[] = [
  dashboardTutorial,
  homeSearchTutorial,
  recipeLibraryTutorial,
  recipeDetailTutorial,
  mealPlannerTutorial,
  storeTutorial,
  homeWrapUpTutorial,
]
