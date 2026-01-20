/**
 * Hooks Barrel Export
 * Provides centralized exports for all hooks organized by domain
 * Enables backwards-compatible imports from @/hooks
 */

// UI Hooks
export { useIsMobile } from "./ui/use-mobile"
export { useToast, toast } from "./ui/use-toast"
export { useResponsiveImage } from "./ui/use-responsive-image"

// Recipe Hooks
export {
  useRecipesFiltered,
  useRecipes,
  useUserRecipes,
  useRecipe,
  useFavorites,
  useToggleFavorite,
  useStandardizeRecipeIngredients,
  type SortBy
} from "./recipe/use-recipe"

// Shopping Hooks
export { useShoppingList } from "./shopping/use-shopping-list"
export { useMergedItems, distributeQuantityChange } from "./shopping/use-merged-items"
export { useStoreComparison } from "./shopping/use-store-comparison"
export { useClosestStore } from "./shopping/use-closest-store"

// Meal Planner Hooks
export { useMealPlanner } from "./meal-planner/use-meal-planner"
export { useMealPlannerRecipes } from "./meal-planner/use-meal-planner-recipes"
export { useMealPlannerNutrition } from "./meal-planner/use-meal-planner-nutrition"
export { useMealPlannerAi } from "./meal-planner/use-meal-planner-ai"
export { useMealPlannerDragDrop } from "./meal-planner/use-meal-planner-drag-drop"
export { useDatePagination } from "./meal-planner/use-date-pagination"
export { useWeeklyMealPlan } from "./meal-planner/use-weekly-meal-plan"
