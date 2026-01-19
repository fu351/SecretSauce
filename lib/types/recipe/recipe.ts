import type { RecipeIngredient } from './ingredient'
import type { Instruction } from './instruction'
import type { NutritionInfo } from './nutrition'
import type { RecipeTags, DifficultyLevel } from './tags'

/**
 * UI Recipe Type
 *
 * PRIMARY recipe type used throughout the application UI.
 * Contains full recipe data including tags, ratings, and UI-specific fields.
 *
 * Represents a complete recipe in the database with all metadata and relationships.
 *
 * NOTE: There is a separate Recipe type in lib/planner/types.ts used specifically
 * for meal planning algorithms. That type has a different structure optimized for
 * planning operations. For UI operations, use this Recipe type.
 *
 * @see lib/planner/types.ts Recipe - Planning-specific recipe type
 *
 * @example
 * const recipe: Recipe = {
 *   id: "recipe-123",
 *   title: "Chocolate Chip Cookies",
 *   description: "Classic chocolate chip cookies",
 *   prep_time: 15,
 *   cook_time: 12,
 *   servings: 24,
 *   difficulty: "beginner",
 *   cuisine_name: "American",
 *   ingredients: [...],
 *   instructions: [...],
 *   tags: { dietary: ['vegetarian'] },
 *   author_id: "user-123",
 *   created_at: "2024-01-01T00:00:00Z",
 *   updated_at: "2024-01-01T00:00:00Z",
 *   rating_avg: 4.5,
 *   rating_count: 42
 * }
 */
export interface Recipe {
  id: string
  title: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: DifficultyLevel
  cuisine_id?: number
  cuisine_name?: string

  content?: {
    image_url?: string
    description?: string
    instructions?: Instruction[]
  }

  // UNIFIED TAG SYSTEM
  // All recipe categorization uses single "tags" field with JSONB structure
  tags: RecipeTags

  // Recipe components
  ingredients: RecipeIngredient[]

  // Metadata
  author_id: string
  created_at: string
  updated_at: string

  // Ratings
  rating_avg: number
  rating_count: number

  // Optional nutrition info
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}
