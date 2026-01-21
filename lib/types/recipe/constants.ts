import type { DietaryTag, ProteinTag, MealTypeTag, CuisineType, DifficultyLevel, AllergenTag } from './tags'
import type { Recipe } from './recipe'


// Finalize constant exports
export const DIETARY_TAGS: DietaryTag[] = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'keto',
  'paleo',
  'low-carb',
  'other'
]

export const ALLERGEN_TAGS: AllergenTag[] = [
  'contains-dairy',
  'contains-gluten',
  'contains-nuts',
  'contains-shellfish',
  'contains-egg',
  'contains-soy',
]

export const RECIPE_TAGS = [...DIETARY_TAGS, ...ALLERGEN_TAGS] as const

export const PROTEIN_TAGS: ProteinTag[] = [
  'chicken',
  'beef',
  'pork',
  'fish',
  'shellfish',
  'turkey',
  'tofu',
  'legume',
  'egg',
  'other'
]

export const MEAL_TYPE_TAGS: MealTypeTag[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert'
]

export const CUISINE_TYPES: CuisineType[] = [
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
  'other'
]

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  'beginner',
  'intermediate',
  'advanced'
]

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
  return recipe.tags.includes(tag)
}