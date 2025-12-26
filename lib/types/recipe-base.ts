
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

export interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: DifficultyLevel
  cuisine: CuisineType
  image_url?: string
  tags: DietaryTag
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
export type CuisineType = typeof CUISINE_TYPES[number]
export type DifficultyLevel = typeof DIFFICULTY_LEVELS[number]
