import type { RecipeIngredient } from '../recipe/ingredient'

/**
 * Form Input for Ingredients
 *
 * String-based ingredient input used in HTML forms.
 * All numeric fields are strings to preserve user input before conversion.
 * Converts to RecipeIngredient on form submission.
 *
 * @see RecipeIngredient - Database type after conversion
 * @see convertFormIngredients - Conversion function
 *
 * @example
 * const formInput: IngredientFormInput = {
 *   name: "chicken breast",
 *   amount: "2",        // String, not number
 *   unit: "lbs",
 *   standardizedIngredientId: "abc123",
 *   standardizedName: "chicken breast"
 * }
 */
export interface IngredientFormInput {
  name: string
  amount: string // User input as string, converted to number on submit
  unit: string
  standardizedIngredientId?: string
  standardizedName?: string
}

/**
 * Convert form ingredient inputs to database ingredient types
 *
 * Filters out empty ingredients and converts string amounts to numbers.
 * Called during recipe form submission to prepare data for database storage.
 *
 * @param inputs - Array of form input ingredients
 * @returns Array of fully typed RecipeIngredient objects
 *
 * @example
 * const formInputs: IngredientFormInput[] = [
 *   { name: "flour", amount: "2", unit: "cups" },
 *   { name: "sugar", amount: "1", unit: "cup" }
 * ]
 * const ingredients = convertFormIngredients(formInputs)
 * // Returns: [
 * //   { name: "flour", quantity: 2, unit: "cups" },
 * //   { name: "sugar", quantity: 1, unit: "cup" }
 * // ]
 */
export function convertFormIngredients(inputs: IngredientFormInput[]): RecipeIngredient[] {
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
