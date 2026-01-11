/**
 * Import Recipe Form Data Type
 *
 * String-based form data structure used when importing recipes from external sources
 * (URL scraping, Instagram, Image OCR). All fields are strings to support partial
 * or incomplete data from import sources.
 *
 * This gets validated and converted to RecipeSubmissionData before database save.
 *
 * @see RecipeSubmissionData - Fully typed version used for database submission
 *
 * @example
 * const formData: ImportRecipeFormData = {
 *   title: "Chocolate Chip Cookies",
 *   description: "Classic cookies",
 *   image_url: "https://...",
 *   prep_time: "15",  // String, not number
 *   cook_time: "12",  // String, not number
 *   servings: "24",
 *   difficulty: "beginner",
 *   cuisine: "american",
 *   dietary_tags: ["vegetarian"],
 *   calories: "150",  // String
 *   protein: "3",     // String
 *   carbs: "20",      // String
 *   fat: "7"          // String
 * }
 */
export interface ImportRecipeFormData {
  title: string
  description: string
  image_url: string
  prep_time: string
  cook_time: string
  servings: string
  difficulty: string
  cuisine: string
  dietary_tags: string[]
  calories: string
  protein: string
  carbs: string
  fat: string
}

/**
 * @deprecated Use ImportRecipeFormData instead
 *
 * This type alias is maintained for backward compatibility during migration.
 * All new code should use ImportRecipeFormData.
 */
export type RecipeFormData = ImportRecipeFormData
