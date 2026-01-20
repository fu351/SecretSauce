/**
 * Recipe Tags Type
 *
 * Array of dietary tags including both user-selected preferences and auto-detected allergen flags.
 * This consolidates all dietary restrictions and allergen information into a single array.
 *
 * Note: protein and meal_type are stored as separate fields on the Recipe type.
 *
 * @see DIETARY_TAGS
 */
export type RecipeTags = DietaryTag[]

/**
 * Dietary Tag Type - values derived from DIETARY_TAGS constant
 *
 * Represents dietary preferences and restrictions (vegetarian, vegan, etc.)
 * User-editable and explicitly set by recipe author or importer.
 */
export type DietaryTag =
  // --- Lifestyle & Diets ---
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'keto'
  | 'paleo'
  | 'low-carb'
  | 'contains-dairy'
  | 'contains-gluten'
  | 'contains-nuts'
  | 'contains-shellfish'
  | 'contains-egg'
  | 'contains-soy'
  | 'other'

/**
 * Protein Tag Type - values derived from PROTEIN_TAGS constant
 *
 * Represents the main protein source in the recipe.
 * Auto-generated based on ingredient analysis.
 */
export type ProteinTag =
  | 'chicken'
  | 'beef'
  | 'pork'
  | 'fish'
  | 'shellfish'
  | 'turkey'
  | 'tofu'
  | 'legume'
  | 'egg'
  | 'other'

/**
 * Meal Type Tag - values derived from MEAL_TYPE_TAGS constant
 *
 * Classifies the recipe as breakfast, lunch, dinner, snack, or dessert.
 * Auto-generated based on recipe characteristics.
 */
export type MealTypeTag = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'

/**
 * Cuisine Type - values derived from CUISINE_TYPES constant
 *
 * Represents the cuisine or origin of the recipe.
 * Can be auto-detected or manually specified.
 */
export type CuisineType =
  | 'italian'
  | 'mexican'
  | 'chinese'
  | 'indian'
  | 'american'
  | 'french'
  | 'japanese'
  | 'thai'
  | 'mediterranean'
  | 'korean'
  | 'greek'
  | 'spanish'
  | 'vietnamese'
  | 'middle-eastern'
  | 'other'

/**
 * Difficulty Level Type - values derived from DIFFICULTY_LEVELS constant
 *
 * Represents the complexity level of the recipe.
 * Helps users find recipes appropriate for their skill level.
 */
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'
