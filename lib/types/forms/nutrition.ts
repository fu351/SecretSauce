import type { NutritionInfo } from '../recipe/nutrition'

/**
 * Form Input for Nutrition
 *
 * String-based nutrition input used in HTML forms.
 * All fields are strings to preserve user input formatting before conversion.
 * Converts to NutritionInfo on form submission.
 *
 * @see NutritionInfo - Database type after conversion
 * @see convertFormNutrition - Conversion function
 *
 * @example
 * const formInput: NutritionFormInput = {
 *   calories: "250",    // String, not number
 *   protein: "15",      // String, not number
 *   carbs: "30",
 *   fat: "8"
 * }
 */
export interface NutritionFormInput {
  calories: string
  protein: string
  carbs: string
  fat: string
}

/**
 * Convert form nutrition inputs to database nutrition type
 *
 * Converts string inputs to numbers, returns undefined for empty values.
 * Called during recipe form submission to prepare nutrition data for database storage.
 *
 * @param input - Form input nutrition data
 * @returns Fully typed NutritionInfo object with number values
 *
 * @example
 * const formInput: NutritionFormInput = {
 *   calories: "250",
 *   protein: "15",
 *   carbs: "30",
 *   fat: "8"
 * }
 * const nutrition = convertFormNutrition(formInput)
 * // Returns: { calories: 250, protein: 15, carbs: 30, fat: 8 }
 *
 * @example
 * // Empty values return undefined
 * const formInput: NutritionFormInput = {
 *   calories: "",
 *   protein: "15",
 *   carbs: "",
 *   fat: "8"
 * }
 * const nutrition = convertFormNutrition(formInput)
 * // Returns: { protein: 15, fat: 8 }
 */
export function convertFormNutrition(input: NutritionFormInput): NutritionInfo {
  return {
    calories: input.calories ? parseInt(input.calories) : undefined,
    protein: input.protein ? parseInt(input.protein) : undefined,
    carbs: input.carbs ? parseInt(input.carbs) : undefined,
    fat: input.fat ? parseInt(input.fat) : undefined,
  }
}
