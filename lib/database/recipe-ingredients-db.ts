import { BaseTable } from './base-db'
import { standardizedIngredientsDB } from './standardized-ingredients-db'
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

  private async getDebugContext(): Promise<{ userId: string | null } | null> {
    if (process.env.NODE_ENV === 'production') return null

    try {
      const { data, error } = await this.supabase.auth.getSession()
      if (error) {
        console.warn('[RecipeIngredients DB] Auth session error', error)
        return { userId: null }
      }
      return { userId: data.session?.user?.id ?? null }
    } catch (error) {
      console.warn('[RecipeIngredients DB] Auth session exception', error)
      return { userId: null }
    }
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
      const debugContext = await this.getDebugContext()
      console.log('[RecipeIngredients DB] findByRecipeId start', { recipeId, ...(debugContext || {}) })

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('recipe_id', recipeId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[RecipeIngredients DB] findByRecipeId error', error)
        this.handleError(error, 'findByRecipeId')
        return []
      }

      console.log('[RecipeIngredients DB] findByRecipeId result', { recipeId, count: data?.length ?? 0 })
      return data || []
    } catch (error) {
      console.error('[RecipeIngredients DB] findByRecipeId exception', error)
      this.handleError(error, 'findByRecipeId')
      return []
    }
  }

  /**
   * Batch fetch ingredients for multiple recipes
   */
  async findByRecipeIds(recipeIds: string[]): Promise<RecipeIngredientRow[]> {
    try {
      const debugContext = await this.getDebugContext()
      console.log('[RecipeIngredients DB] findByRecipeIds start', {
        recipeIdsCount: recipeIds.length,
        ...(debugContext || {})
      })

      if (recipeIds.length === 0) return []

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .in('recipe_id', recipeIds)
        .is('deleted_at', null)
        .order('recipe_id', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[RecipeIngredients DB] findByRecipeIds error', error)
        this.handleError(error, 'findByRecipeIds')
        return []
      }

      console.log('[RecipeIngredients DB] findByRecipeIds result', { count: data?.length ?? 0 })
      return data || []
    } catch (error) {
      console.error('[RecipeIngredients DB] findByRecipeIds exception', error)
      this.handleError(error, 'findByRecipeIds')
      return []
    }
  }

  /**
   * Fetch ingredients for a recipe with standardized ingredient details
   */
  async findByRecipeIdWithStandardized(recipeId: string): Promise<RecipeIngredientWithStandardized[]> {
    try {
      const debugContext = await this.getDebugContext()
      console.log('[RecipeIngredients DB] findByRecipeIdWithStandardized start', {
        recipeId,
        ...(debugContext || {})
      })

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('recipe_id', recipeId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[RecipeIngredients DB] findByRecipeIdWithStandardized error', error)
        this.handleError(error, 'findByRecipeIdWithStandardized')
        return []
      }

      const ingredients = data || []
      console.log('[RecipeIngredients DB] findByRecipeIdWithStandardized result', {
        recipeId,
        count: ingredients.length
      })
      const standardizedIds = [
        ...new Set(ingredients.map((item) => item.standardized_ingredient_id).filter(Boolean))
      ] as string[]

      if (standardizedIds.length === 0) {
        return ingredients.map((item) => ({
          ...item,
          standardized_ingredient: null
        })) as RecipeIngredientWithStandardized[]
      }

      const standardized = await standardizedIngredientsDB.findByIds(standardizedIds)
      console.log('[RecipeIngredients DB] standardized lookup result', {
        recipeId,
        standardizedIdsCount: standardizedIds.length,
        standardizedFound: standardized.length
      })
      const standardizedById = new Map(standardized.map((item) => [item.id, item]))

      return ingredients.map((item) => ({
        ...item,
        standardized_ingredient: item.standardized_ingredient_id
          ? standardizedById.get(item.standardized_ingredient_id) || null
          : null
      })) as RecipeIngredientWithStandardized[]
    } catch (error) {
      console.error('[RecipeIngredients DB] findByRecipeIdWithStandardized exception', error)
      this.handleError(error, 'findByRecipeIdWithStandardized')
      return []
    }
  }

  /**
   * Batch upsert ingredient display names for a recipe.
   * Relies on the database trigger to auto-link standardized_ingredient_id.
   */
  async batchUpsertDisplayNames(recipeId: string, displayNames: string[]): Promise<boolean> {
    try {
      const uniqueNames = [...new Set(displayNames.map((name) => name.trim()).filter(Boolean))]
      if (uniqueNames.length === 0) return true

      const payloads = uniqueNames.map((displayName) => ({
        recipe_id: recipeId,
        display_name: displayName
      }))

      const { error } = await this.supabase
        .from(this.tableName)
        .upsert(payloads, { onConflict: 'recipe_id,display_name' })

      if (error) {
        this.handleError(error, 'batchUpsertDisplayNames')
        return false
      }

      return true
    } catch (error) {
      this.handleError(error, 'batchUpsertDisplayNames')
      return false
    }
  }

  /**
   * Get a single ingredient row for a recipe/display_name pair.
   */
  async findByRecipeIdAndDisplayName(
    recipeId: string,
    displayName: string
  ): Promise<RecipeIngredientRow | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('recipe_id', recipeId)
        .eq('display_name', displayName)
        .is('deleted_at', null)
        .single()

      if (error) {
        this.handleError(error, 'findByRecipeIdAndDisplayName')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'findByRecipeIdAndDisplayName')
      return null
    }
  }

  /**
   * Upsert a single ingredient row and set its standardized_ingredient_id.
   * Uses the unique (recipe_id, display_name) constraint.
   */
  async upsertDisplayNameWithStandardized(
    recipeId: string,
    displayName: string,
    standardizedIngredientId: string
  ): Promise<RecipeIngredientRow | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(
          {
            recipe_id: recipeId,
            display_name: displayName,
            standardized_ingredient_id: standardizedIngredientId,
            deleted_at: null,
          },
          { onConflict: 'recipe_id,display_name' }
        )
        .select('*')
        .single()

      if (error) {
        this.handleError(error, 'upsertDisplayNameWithStandardized')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'upsertDisplayNameWithStandardized')
      return null
    }
  }

  /**
   * Batch upsert display names with standardized IDs in a single query.
   */
  async batchUpsertStandardized(
    recipeId: string,
    mappings: Array<{ displayName: string; standardizedIngredientId: string }>
  ): Promise<boolean> {
    try {
      if (mappings.length === 0) return true

      const payload = mappings.map((item) => ({
        recipe_id: recipeId,
        display_name: item.displayName,
        standardized_ingredient_id: item.standardizedIngredientId,
        deleted_at: null,
      }))

      const { error } = await this.supabase
        .from(this.tableName)
        .upsert(payload, { onConflict: 'recipe_id,display_name' })

      if (error) {
        this.handleError(error, 'batchUpsertStandardized')
        return false
      }

      return true
    } catch (error) {
      this.handleError(error, 'batchUpsertStandardized')
      return false
    }
  }
}

export const recipeIngredientsDB = RecipeIngredientsTable.getInstance()
