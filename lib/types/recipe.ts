
export interface Ingredient {
  name: string
  quantity?: number
  unit?: string
  standardizedIngredientId?: string
  standardizedName?: string
}

export interface Instruction {
  step: number
  description: string
}

export interface NutritionInfo {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sodium?: number
}

// Allergen tags - what the recipe contains
export interface AllergenTags {
  contains_dairy: boolean
  contains_gluten: boolean
  contains_nuts: boolean
  contains_shellfish: boolean
  contains_egg: boolean
  contains_soy: boolean
}

// Unified tag structure stored in JSONB
export interface RecipeTags {
  dietary: DietaryTag[]              // User-editable dietary restrictions
  allergens?: AllergenTags           // Auto-generated: what recipe contains
  protein?: ProteinTag               // Auto-generated: main protein type
  meal_type?: MealTypeTag            // Auto-generated: meal classification
  cuisine_guess?: string             // Auto-generated: AI-detected cuisine hint
}

export interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: DifficultyLevel
  cuisine_id?: number
  cuisine_name?: string
  image_url?: string

  // UNIFIED TAG SYSTEM
  // All recipe categorization uses single "tags" field with JSONB structure
  tags: RecipeTags

  ingredients: Ingredient[]
  instructions: string[]
  author_id: string
  created_at: string
  updated_at: string
  rating_avg: number
  rating_count: number
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

//constants

export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'keto',
  'paleo',
  'low-carb',
  'other',
] as const

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
] as const

export const MEAL_TYPE_TAGS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
] as const

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
] as const

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export type DietaryTag = typeof DIETARY_TAGS[number]
export type ProteinTag = typeof PROTEIN_TAGS[number]
export type MealTypeTag = typeof MEAL_TYPE_TAGS[number]
export type CuisineType = typeof CUISINE_TYPES[number]
export type DifficultyLevel = typeof DIFFICULTY_LEVELS[number]

// Helper functions for tag operations
export function hasTag(recipe: Recipe, tag: DietaryTag): boolean {
  return recipe.tags.dietary.includes(tag)
}

export function getAllergens(recipe: Recipe): string[] {
  if (!recipe.tags.allergens) return []
  return Object.entries(recipe.tags.allergens)
    .filter(([_, value]) => value)
    .map(([key, _]) => key.replace('contains_', ''))
}
