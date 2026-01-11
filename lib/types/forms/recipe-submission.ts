import type { RecipeIngredient } from '../recipe/ingredient'
import type { Instruction } from '../recipe/instruction'
import type { NutritionInfo } from '../recipe/nutrition'

/**
 * Recipe Submission Data Type
 *
 * Fully typed recipe data ready for database submission.
 * All fields are properly typed (numbers, not strings) and validated.
 *
 * Used when submitting new recipes or edits to the database.
 * Converted from IngredientFormInput, NutritionFormInput, and other form fields.
 *
 * @see ImportRecipeFormData - String-based version from import sources
 * @see RecipeIngredient - Ingredient component type
 * @see Instruction - Instruction component type
 * @see NutritionInfo - Nutrition component type
 *
 * @example
 * const submissionData: RecipeSubmissionData = {
 *   title: "Chocolate Chip Cookies",
 *   description: "Classic cookies",
 *   image_url: "https://...",
 *   imageFile: null,
 *   prep_time: 15,
 *   cook_time: 12,
 *   servings: 24,
 *   difficulty: "beginner",
 *   cuisine: "american",
 *   dietary_tags: ["vegetarian"],
 *   ingredients: [{name: "flour", quantity: 2, unit: "cups"}],
 *   instructions: [{step: 1, description: "Mix ingredients"}],
 *   nutrition: {calories: 150, protein: 3, carbs: 20, fat: 7}
 * }
 */
export interface RecipeSubmissionData {
  title: string
  description: string
  image_url: string | null
  imageFile: File | null
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine: string | null
  dietary_tags: string[]
  ingredients: RecipeIngredient[]
  instructions: Instruction[]
  nutrition: NutritionInfo
}
