import type { RecipeIngredient } from '../recipe/ingredient'
import type { Instruction } from '../recipe/instruction'
import type { NutritionInfo } from '../recipe/nutrition'
import type { RecipeTags, DietaryTag } from '../recipe/tags'

/**
 * Recipe Import Source Type
 *
 * Indicates where the recipe data was imported from.
 * Used to customize import handling and data validation.
 */
export type RecipeImportSource = 'url' | 'instagram' | 'image' | 'manual'

/**
 * Imported Recipe Data Type
 *
 * Partial recipe structure used during import from external sources.
 * Fields are optional because imported recipes may have incomplete information.
 *
 * Imported recipes are typically reviewed and corrected before saving to the database.
 * Once validated, data is converted to RecipeSubmissionData for database storage.
 *
 * @see RecipeSubmissionData - Full typed version for database submission
 * @see ImportRecipeFormData - String-based form version for import editing
 *
 * @example
 * const importedRecipe: ImportedRecipe = {
 *   title: "Pasta Carbonara",
 *   description: "Classic Italian pasta",
 *   ingredients: [{name: "pasta", quantity: 1, unit: "lb"}],
 *   instructions: [{step: 1, description: "Boil water"}],
 *   tags: { dietary: [] },
 *   source_type: "url",
 *   source_url: "https://example.com/recipe",
 *   confidence: { title: 0.95, ingredients: 0.88 }
 * }
 */
export interface ImportedRecipe {
  title?: string
  description?: string
  image_url?: string
  prep_time?: number
  cook_time?: number
  total_time?: number
  servings?: number
  cuisine?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'

  // Recipe components
  ingredients?: RecipeIngredient[]
  instructions?: Instruction[]

  // Tag structure
  tags?: RecipeTags

  // Legacy field for backward compatibility - maps to tags.dietary
  dietary_tags?: DietaryTag[]

  // Optional nutrition info
  nutrition?: NutritionInfo

  // Import metadata
  source_url?: string
  source_type: RecipeImportSource

  // Confidence scores for imported fields
  // Highlights uncertain data for user review
  confidence?: {
    title?: number
    ingredients?: number
    instructions?: number
    [key: string]: number | undefined
  }
}

/**
 * Recipe Import API Response Type
 *
 * Standard response structure from recipe import endpoints.
 * Contains either the imported recipe or error information.
 */
export interface RecipeImportResponse {
  success: boolean
  recipe?: ImportedRecipe
  error?: string
  warnings?: string[]
}
