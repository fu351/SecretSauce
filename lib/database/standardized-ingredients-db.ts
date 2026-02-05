import { BaseTable } from './base-db'
import type { Database } from '@/lib/database/supabase'

type StandardizedIngredientRow = Database['public']['Tables']['standardized_ingredients']['Row']
type StandardizedIngredientInsert = Database['public']['Tables']['standardized_ingredients']['Insert']
type StandardizedIngredientUpdate = Database['public']['Tables']['standardized_ingredients']['Update']

class StandardizedIngredientsTable extends BaseTable<
  'standardized_ingredients',
  StandardizedIngredientRow,
  StandardizedIngredientInsert,
  StandardizedIngredientUpdate
> {
  private static instance: StandardizedIngredientsTable
  readonly tableName = 'standardized_ingredients' as const

  private constructor() {
    super()
  }

  static getInstance(): StandardizedIngredientsTable {
    if (!StandardizedIngredientsTable.instance) {
      StandardizedIngredientsTable.instance = new StandardizedIngredientsTable()
    }
    return StandardizedIngredientsTable.instance
  }

  /**
   * Search by canonical name (exact match)
   * Used by ingredient-cache.ts
   */
  async findByCanonicalName(canonicalName: string): Promise<StandardizedIngredientRow | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('canonical_name', canonicalName)
        .maybeSingle()

      if (error) {
        this.handleError(error, 'findByCanonicalName')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'findByCanonicalName')
      return null
    }
  }

  /**
   * Search using full-text search (uses search_vector)
   * Returns ranked results by relevance
   */
  async searchByText(
    query: string,
    options?: {
      limit?: number
      similarityThreshold?: number
    }
  ): Promise<StandardizedIngredientRow[]> {
    try {
      console.log(`[StandardizedIngredientsTable] Searching for: ${query}`)

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      // Add the configuration object as the third argument
      .textSearch('search_vector', query, {
        config: 'english',
        type: 'plain' // <--- This is the key change
      })
      .limit(options?.limit || 10)
      if (error) {
        this.handleError(error, 'searchByText')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'searchByText')
      return []
    }
  }

  /**
   * Fuzzy search using ILIKE with variants
   * Fallback when full-text search isn't available
   */
  async searchByVariants(variants: string[]): Promise<StandardizedIngredientRow[]> {
    try {
      if (variants.length === 0) return []

      console.log(`[StandardizedIngredientsTable] Searching variants: ${variants.join(', ')}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .ilike('canonical_name', `%${variants[0]}%`)

      if (error) {
        this.handleError(error, 'searchByVariants')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'searchByVariants')
      return []
    }
  }

  /**
   * Get or create standardized ingredient (upsert pattern)
   * Used extensively by ingredient-cache.ts
   */
  async getOrCreate(
    canonicalName: string,
    category?: string | null
  ): Promise<StandardizedIngredientRow | null> {
    try {
      console.log(`[StandardizedIngredientsTable] Get or create: ${canonicalName}`)

      // Try to find existing
      const existing = await this.findByCanonicalName(canonicalName)
      if (existing) return existing

      // Create new
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({ canonical_name: canonicalName, category })
        .select()
        .single()

      if (error) {
        this.handleError(error, 'getOrCreate')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'getOrCreate')
      return null
    }
  }

  /**
   * Batch get or create multiple ingredients
   * CRITICAL: Single upsert instead of N queries
   */
  async batchGetOrCreate(
    items: Array<{ canonicalName: string; category: string | null }>
  ): Promise<Map<string, string>> {
    try {
      console.log(`[StandardizedIngredientsTable] Batch get or create: ${items.length} items`)

      const result = new Map<string, string>()

      if (items.length === 0) return result

      // Prepare insert data
      const insertData = items.map(item => ({
        canonical_name: item.canonicalName,
        category: item.category
      }))

      // Upsert all items (on conflict, do nothing - just return existing)
      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(insertData, {
          onConflict: 'canonical_name',
          ignoreDuplicates: false
        })
        .select()

      if (error) {
        this.handleError(error, 'batchGetOrCreate')
        return result
      }

      // Build map of canonical_name -> id
      if (data) {
        for (const row of data) {
          result.set(row.canonical_name, row.id)
        }
      }

      return result
    } catch (error) {
      this.handleError(error, 'batchGetOrCreate')
      return new Map()
    }
  }

  /**
   * Get ingredients by category
   * Used for pantry item suggestions
   */
  async findByCategory(category: string): Promise<StandardizedIngredientRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('category', category)
        .order('canonical_name', { ascending: true })

      if (error) {
        this.handleError(error, 'findByCategory')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByCategory')
      return []
    }
  }

  /**
   * Batch fetch by IDs
   * Used by ingredient-cache.ts for metadata lookups
   */
  async fetchByIds(ids: string[]): Promise<StandardizedIngredientRow[]> {
    try {
      if (ids.length === 0) return []

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .in('id', ids)

      if (error) {
        this.handleError(error, 'fetchByIds')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'fetchByIds')
      return []
    }
  }
  /**
   * Fetches a sample of canonical names for system context or AI training.
   * Centralizes the logic used by the AI standardizer.
   */
  async getCanonicalNameSample(sampleSize = 200): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('canonical_name')
        .limit(sampleSize)

      if (error) {
        this.handleError(error, 'getCanonicalNameSample')
        return []
      }

      return data
        .map((row) => row.canonical_name)
        .filter((name): name is string => !!name && name.trim().length > 0)
    } catch (error) {
      this.handleError(error, 'getCanonicalNameSample')
      return []
    }
  }
}

export const standardizedIngredientsDB = StandardizedIngredientsTable.getInstance()
