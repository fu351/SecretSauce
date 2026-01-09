import { Ingredient, Instruction, NutritionInfo } from './recipe'

/**
 * Form input types for ingredients (string-based for form handling)
 * Converts to Ingredient type on submission
 */
export interface IngredientFormInput {
  name: string
  amount: string // User input as string, converted to number on submit
  unit: string
  standardizedIngredientId?: string
  standardizedName?: string
}

/**
 * Form input types for nutrition (all strings)
 * Converts to NutritionInfo type on submission
 */
export interface NutritionFormInput {
  calories: string
  protein: string
  carbs: string
  fat: string
}

/**
 * Complete recipe submission data structure
 * Used when submitting form to database
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
  ingredients: Ingredient[] // Converted from IngredientFormInput
  instructions: Instruction[]
  nutrition: NutritionInfo
}

/**
 * Convert form ingredient inputs to database ingredient types
 * Filters out empty ingredients and converts string amounts to numbers
 */
export function convertFormIngredients(inputs: IngredientFormInput[]): Ingredient[] {
  return inputs
    .filter((input) => input.name.trim())
    .map((input) => ({
      name: input.name,
      quantity: input.amount ? parseFloat(input.amount) : undefined,
      unit: input.unit || undefined,
      standardizedIngredientId: input.standardizedIngredientId,
      standardizedName: input.standardizedName,
    }))
}

/**
 * Convert form nutrition inputs to database nutrition type
 * Converts string inputs to numbers, returns undefined for empty values
 */
export function convertFormNutrition(input: NutritionFormInput): NutritionInfo {
  return {
    calories: input.calories ? parseInt(input.calories) : undefined,
    protein: input.protein ? parseInt(input.protein) : undefined,
    carbs: input.carbs ? parseInt(input.carbs) : undefined,
    fat: input.fat ? parseInt(input.fat) : undefined,
  }
}
