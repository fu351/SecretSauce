import type { DietaryTag, ProteinTag, MealTypeTag, CuisineType, DifficultyLevel } from './tags'
import type { Recipe } from './recipe'

/**
 * Dietary tag constants
 * Used for form dropdowns, validation, and tag generation
 */
export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'keto',
  'paleo',
  'low-carb',
  'other',
] as const satisfies readonly DietaryTag[]

/**
 * Protein tag constants
 * Used for automatic protein detection and categorization
 */
export const PROTEIN_TAGS = [
  'chicken',
  'beef',
  'pork',
  'fish',
  'shellfish',
  'turkey',
  'tofu',
  'legume',
  'egg',
  'other',
] as const satisfies readonly ProteinTag[]

/**
 * Meal type tag constants
 * Used for recipe classification and filtering
 */
export const MEAL_TYPE_TAGS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
] as const satisfies readonly MealTypeTag[]

/**
 * Cuisine type constants
 * Used for cuisine-based filtering and recommendations
 */
export const CUISINE_TYPES = [
  'italian',
  'mexican',
  'chinese',
  'indian',
  'american',
  'french',
  'japanese',
  'thai',
  'mediterranean',
  'korean',
  'greek',
  'spanish',
  'vietnamese',
  'middle-eastern',
  'other',
] as const satisfies readonly CuisineType[]

/**
 * Difficulty level constants
 * Used for skill-based recipe discovery
 */
export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const satisfies readonly DifficultyLevel[]

// ============================================================================
// HELPER FUNCTIONS FOR TAG OPERATIONS
// ============================================================================

/**
 * Check if a recipe has a specific dietary tag
 *
 * @param recipe - Recipe to check
 * @param tag - Dietary tag to search for
 * @returns True if recipe has the tag
 *
 * @example
 * if (hasTag(recipe, 'vegan')) {
 *   // Recipe is vegan
 * }
 */
export function hasTag(recipe: Recipe, tag: DietaryTag): boolean {
  return recipe.tags.dietary.includes(tag)
}

/**
 * Extract allergen labels from a recipe's allergen tags
 *
 * Converts allergen field names (e.g., 'contains_dairy') to human-readable labels (e.g., 'dairy')
 * Only returns allergens that are marked as present (true).
 *
 * @param recipe - Recipe to extract allergens from
 * @returns Array of allergen names (e.g., ['dairy', 'nuts'])
 *
 * @example
 * const allergens = getAllergens(recipe)
 * // Returns: ['dairy', 'nuts'] if recipe contains these allergens
 */
