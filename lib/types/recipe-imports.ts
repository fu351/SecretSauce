import { RecipeTags, DietaryTag } from "./recipe"
import { Ingredient, Instruction, NutritionInfo } from "./recipe"

// Source types for imported recipes
export type RecipeImportSource = 'url' | 'instagram' | 'image' | 'manual'

// Imported recipe data structure (from scrapers/OCR)
// This is a partial Recipe used during import - fields can be incomplete
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
  ingredients?: Ingredient[]
  instructions?: Instruction[] | string[]
  // Use the new unified tags structure
  tags?: RecipeTags
  // Legacy field for backward compatibility - maps to tags.dietary
  dietary_tags?: DietaryTag[]
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
