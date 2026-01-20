// ============================================================================
// CORE TYPES
// ============================================================================
export type { BaseIngredient, StandardizedIngredient } from './core/ingredient'

// ============================================================================
// RECIPE DOMAIN
// ============================================================================
export type { Recipe } from './recipe/recipe'
export type { RecipeIngredient } from './recipe/ingredient'
export type { Instruction } from './recipe/instruction'
export { normalizeInstructions, parseInstructionsFromDB } from './recipe/instruction'
export type { NutritionInfo } from './recipe/nutrition'
export type {
  RecipeTags,
  DietaryTag,
  ProteinTag,
  MealTypeTag,
  CuisineType,
  DifficultyLevel,
} from './recipe/tags'
export {
  DIETARY_TAGS,
  PROTEIN_TAGS,
  MEAL_TYPE_TAGS,
  CUISINE_TYPES,
  DIFFICULTY_LEVELS,
  hasTag
} from './recipe/constants'

// ============================================================================
// RECIPE IMPORT DOMAIN
// ============================================================================
export type {
  ImportedRecipe,
  RecipeImportSource,
  RecipeImportResponse,
} from './recipe-import/imported-recipe'
export type { ImportRecipeFormData, RecipeFormData } from './recipe-import/import-form'
export type { OCRResult, InstagramPostData } from './recipe-import/import-types'

// ============================================================================
// FORM DOMAIN
// ============================================================================
export type { IngredientFormInput } from './forms/ingredient'
export { convertFormIngredients } from './forms/ingredient'
export type { NutritionFormInput } from './forms/nutrition'
export { convertFormNutrition } from './forms/nutrition'
export type { RecipeSubmissionData } from './forms/recipe-submission'

// ============================================================================
// STORE/SHOPPING DOMAIN
// ============================================================================
export type { ShoppingListIngredient, ShoppingListItem, ShoppingSourceType } from './store/ingredient'
export type { PantryItemInfo } from './store/pantry'
export type { GroceryItem, StoreComparison, ShoppingListSectionProps } from './store/comparison'

// ============================================================================
// UI DOMAIN
// ============================================================================
export type { SkeletonLineProps, SkeletonComponentProps } from './ui/skeleton'
export type { TutorialPath, TutorialStep, TutorialSubstep } from './ui/tutorial'
