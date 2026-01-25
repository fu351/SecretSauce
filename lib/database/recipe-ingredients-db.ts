import { BaseTable } from './base-db'
import type { Database } from '@/lib/database/supabase'

type RecipeIngredientRow = Database['public']['Tables']['recipe_ingredients']['Row']
type RecipeIngredientInsert = Database['public']['Tables']['recipe_ingredients']['Insert']
type RecipeIngredientUpdate = Database['public']['Tables']['recipe_ingredients']['Update']
type StandardizedIngredientRow = Database['public']['Tables']['standardized_ingredients']['Row']

export type RecipeIngredientWithStandardized = RecipeIngredientRow & {
  standardized_ingredient: StandardizedIngredientRow | null
}

class RecipeIngredientsTable extends BaseTable<
  'recipe_ingredients',
  RecipeIngredientRow,
  RecipeIngredientInsert,
  RecipeIngredientUpdate
> {
  private static instance: RecipeIngredientsTable
  readonly tableName = 'recipe_ingredients' as const

  private constructor() {
    super()
  }

  static getInstance(): RecipeIngredientsTable {
    if (!RecipeIngredientsTable.instance) {
      RecipeIngredientsTable.instance = new RecipeIngredientsTable()
    }
    return RecipeIngredientsTable.instance
  }

  /**
   * Get all ingredients for a recipe
   */
  async findByRecipeId(recipeId: string): Promise<RecipeIngredientRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('recipe_id', recipeId)
        .order('created_at', { ascending: true })

      if (error) {
        this.handleError(error, 'findByRecipeId')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByRecipeId')
      return []
    }
  }

  /**
   * Batch fetch ingredients for multiple recipes
   */
  async findByRecipeIds(recipeIds: string[]): Promise<RecipeIngredientRow[]> {
    try {
      if (recipeIds.length === 0) return []

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .in('recipe_id', recipeIds)
        .order('recipe_id', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) {
        this.handleError(error, 'findByRecipeIds')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByRecipeIds')
      return []
    }
  }

  /**
   * Fetch ingredients for a recipe with standardized ingredient details
   */
  async findByRecipeIdWithStandardized(recipeId: string): Promise<RecipeIngredientWithStandardized[]> {
    try {
