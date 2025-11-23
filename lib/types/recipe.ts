// Centralized recipe types for the SecretSauce application

// Core recipe ingredient type
export interface Ingredient {
  name: string
  amount: string
  unit: string
  standardizedIngredientId?: string
  standardizedName?: string
}

// Recipe instruction step
export interface Instruction {
  step: number
  description: string
}

// Nutrition information
export interface NutritionInfo {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sodium?: number
}

// Source types for imported recipes
export type RecipeImportSource = 'url' | 'instagram' | 'image' | 'manual'

// Imported recipe data structure (from scrapers/OCR)
export interface ImportedRecipe {
  title: string
  description?: string
  ingredients: Ingredient[]
  instructions: Instruction[]
  image_url?: string
  prep_time?: number
  cook_time?: number
  total_time?: number
  servings?: number
  cuisine?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  dietary_tags?: string[]
  nutrition?: NutritionInfo
  source_url?: string
  source_type: RecipeImportSource
  // Confidence indicators for highlighting uncertain fields
  confidence?: {
    title?: number
    ingredients?: number
    instructions?: number
    [key: string]: number | undefined
  }
}

// API response types
export interface RecipeImportResponse {
  success: boolean
  recipe?: ImportedRecipe
  error?: string
  warnings?: string[]
}

// OCR processing result
export interface OCRResult {
  text: string
  confidence: number
  blocks?: Array<{
    text: string
    confidence: number
    bbox?: { x: number; y: number; width: number; height: number }
  }>
}

// Instagram post data
export interface InstagramPostData {
  caption: string
  image_url: string
  username?: string
  post_url: string
  timestamp?: string
}

// Recipe form data (for editing before save)
export interface RecipeFormData {
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

// Database recipe type (matches Supabase schema)
export interface DatabaseRecipe {
  id: string
  title: string
  description?: string
  image_url?: string
  prep_time?: number
  cook_time?: number
  servings?: number
  difficulty?: string
  cuisine?: string
  dietary_tags?: string[]
  ingredients: Ingredient[]
  instructions: Instruction[]
  nutrition?: NutritionInfo
  author_id: string
  rating_avg?: number
  rating_count?: number
  created_at: string
  updated_at: string
}

// Constants
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
