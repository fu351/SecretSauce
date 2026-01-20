"use client"

import { BaseTable } from './base-db'
import type { Database } from '@/lib/supabase'

type IngredientMappingRow = Database['public']['Tables']['ingredient_mappings']['Row']
type IngredientMappingInsert = Database['public']['Tables']['ingredient_mappings']['Insert']
type IngredientMappingUpdate = Database['public']['Tables']['ingredient_mappings']['Update']

class IngredientMappingsTable extends BaseTable<
  'ingredient_mappings',
  IngredientMappingRow,
  IngredientMappingInsert,
  IngredientMappingUpdate
> {
  private static instance: IngredientMappingsTable
  readonly tableName = 'ingredient_mappings' as const

  private constructor() {
    super()
  }

  static getInstance(): IngredientMappingsTable {
    if (!IngredientMappingsTable.instance) {
      IngredientMappingsTable.instance = new IngredientMappingsTable()
    }
    return IngredientMappingsTable.instance
  }

  /**
   * Get mapping for a specific recipe ingredient
   */
  async findByRecipeAndName(
    recipeId: string,
    originalName: string
  ): Promise<IngredientMappingRow | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('recipe_id', recipeId)
        .eq('original_name', originalName)
        .single()

      if (error) {
        this.handleError(error, 'findByRecipeAndName')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'findByRecipeAndName')
      return null
    }
  }

  /**
   * Get all mappings for a recipe
   * Used by recipe-pricing.ts and ingredient-cache.ts
   */
  async findByRecipeId(recipeId: string): Promise<IngredientMappingRow[]> {
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
   * Batch fetch mappings for multiple recipes
   * CRITICAL: Single query instead of N queries
   */
  async findByRecipeIds(recipeIds: string[]): Promise<IngredientMappingRow[]> {
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
   * Find mappings by standardized ingredient ID
   * Used for reverse lookups
   */
  async findByStandardizedId(
    standardizedIngredientId: string
  ): Promise<IngredientMappingRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('standardized_ingredient_id', standardizedIngredientId)

      if (error) {
        this.handleError(error, 'findByStandardizedId')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByStandardizedId')
      return []
    }
  }

  /**
   * Create or update a single mapping
   * Upserts on conflict (recipe_id, original_name)
   */
  async upsertMapping(
    recipeId: string,
    originalName: string,
    standardizedIngredientId: string
  ): Promise<IngredientMappingRow | null> {
    try {
      console.log(`[IngredientMappingsTable] Upserting mapping for ${originalName} in recipe ${recipeId}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(
          {
            recipe_id: recipeId,
            original_name: originalName,
            standardized_ingredient_id: standardizedIngredientId
          },
          {
            onConflict: 'recipe_id,original_name'
          }
        )
        .select()
        .single()

      if (error) {
        this.handleError(error, 'upsertMapping')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'upsertMapping')
      return null
    }
  }

  /**
   * Batch create mappings for a recipe (CRITICAL)
   * Single upsert query for all ingredients
   * Used by ingredient-pipeline.ts during recipe import
   */
  async batchUpsertMappings(
    recipeId: string,
    mappings: Array<{
      originalName: string
      standardizedIngredientId: string
    }>
  ): Promise<boolean> {
    try {
      if (mappings.length === 0) return true

      console.log(`[IngredientMappingsTable] Batch upserting ${mappings.length} mappings for recipe ${recipeId}`)

      const insertData = mappings.map(mapping => ({
        recipe_id: recipeId,
        original_name: mapping.originalName,
        standardized_ingredient_id: mapping.standardizedIngredientId
      }))

      const { error } = await this.supabase
        .from(this.tableName)
        .upsert(insertData, {
          onConflict: 'recipe_id,original_name'
        })

      if (error) {
        this.handleError(error, 'batchUpsertMappings')
        return false
      }

      return true
    } catch (error) {
      this.handleError(error, 'batchUpsertMappings')
      return false
    }
  }

  /**
   * Delete all mappings for a recipe
   * Used when re-processing a recipe
   */
  async deleteByRecipeId(recipeId: string): Promise<boolean> {
    try {
      console.log(`[IngredientMappingsTable] Deleting all mappings for recipe ${recipeId}`)

      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('recipe_id', recipeId)

      if (error) {
        this.handleError(error, 'deleteByRecipeId')
        return false
      }

      return true
    } catch (error) {
      this.handleError(error, 'deleteByRecipeId')
      return false
    }
  }

  /**
   * Get recipes that use a specific standardized ingredient
   * Used for ingredient substitution suggestions
   */
  async findRecipesUsingIngredient(
    standardizedIngredientId: string
  ): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('recipe_id')
        .eq('standardized_ingredient_id', standardizedIngredientId)

      if (error) {
        this.handleError(error, 'findRecipesUsingIngredient')
        return []
      }

      // Extract unique recipe IDs
      const recipeIds = [...new Set(data?.map(row => row.recipe_id) || [])]
      return recipeIds
    } catch (error) {
      this.handleError(error, 'findRecipesUsingIngredient')
      return []
    }
  }
}

export const ingredientMappingsDB = IngredientMappingsTable.getInstance()
