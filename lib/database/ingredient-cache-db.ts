
import { BaseTable } from './base-db'
import type { Database } from '@/lib/supabase'

type IngredientCacheRow = Database['public']['Tables']['ingredient_cache']['Row']
type IngredientCacheInsert = Database['public']['Tables']['ingredient_cache']['Insert']
type IngredientCacheUpdate = Database['public']['Tables']['ingredient_cache']['Update']

class IngredientCacheTable extends BaseTable<
  'ingredient_cache',
  IngredientCacheRow,
  IngredientCacheInsert,
  IngredientCacheUpdate
> {
  private static instance: IngredientCacheTable
  readonly tableName = 'ingredient_cache' as const

  private constructor() {
    super()
  }

  static getInstance(): IngredientCacheTable {
    if (!IngredientCacheTable.instance) {
      IngredientCacheTable.instance = new IngredientCacheTable()
    }
    return IngredientCacheTable.instance
  }

  /**
   * Normalize store name to canonical format
   */
  private normalizeStoreName(store: string): string {
    return store.toLowerCase().replace(/\s+/g, '')
  }

  /**
   * Calculate store-specific TTL in hours
   */
  private getStoreTTL(store: string): number {
    const normalized = this.normalizeStoreName(store)
    // Store-specific TTL (12-48 hours based on store)
    const ttlMap: Record<string, number> = {
      'walmart': 24,
      'target': 24,
      'wholefoods': 12,
      'traderjoes': 12,
      'kroger': 24,
      'safeway': 24,
      'albertsons': 24,
      'publix': 24
    }
    return ttlMap[normalized] || 24 // default 24 hours
  }

  /**
   * Calculate expiration date based on store TTL
   */
  private calculateExpiresAt(store: string): string {
    const ttlHours = this.getStoreTTL(store)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + ttlHours)
    return expiresAt.toISOString()
  }

  /**
   * Search cache by standardized ingredient ID
   * Filters out expired entries automatically
   */
  async findByStandardizedId(
    standardizedIngredientId: string,
    stores?: string[],
    zipCode?: string | null
  ): Promise<IngredientCacheRow[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('standardized_ingredient_id', standardizedIngredientId)
        .gt('expires_at', new Date().toISOString())

      if (stores && stores.length > 0) {
        const normalizedStores = stores.map(s => this.normalizeStoreName(s))
        query = query.in('store', normalizedStores)
      }

      if (zipCode) {
        query = query.eq('zip_code', zipCode)
      }

      const { data, error } = await query.order('unit_price', { ascending: true })

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
   * Search cache by multiple ingredient IDs (batch query)
   * Used by recipe-pricing.ts
   */
  async findByStandardizedIds(
    standardizedIngredientIds: string[],
    stores?: string[],
    zipCode?: string | null
  ): Promise<IngredientCacheRow[]> {
    try {
      if (standardizedIngredientIds.length === 0) return []

      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .in('standardized_ingredient_id', standardizedIngredientIds)
        .gt('expires_at', new Date().toISOString())

      if (stores && stores.length > 0) {
        const normalizedStores = stores.map(s => this.normalizeStoreName(s))
        query = query.in('store', normalizedStores)
      }

      if (zipCode) {
        query = query.eq('zip_code', zipCode)
      }

      const { data, error } = await query

      if (error) {
        this.handleError(error, 'findByStandardizedIds')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByStandardizedIds')
      return []
    }
  }

  /**
   * Cache or update a price entry
   * Upserts based on (standardized_ingredient_id, store, zip_code) uniqueness
   * Automatically calculates expires_at based on store-specific TTL
   */
  async cachePrice(
    standardizedIngredientId: string,
    store: string,
    price: number,
    quantity: number,
    unit: string,
    options?: {
      unitPrice?: number | null
      imageUrl?: string | null
      productName?: string | null
      productId?: string | null
      location?: string | null
      zipCode?: string | null
    }
  ): Promise<IngredientCacheRow | null> {
    try {
      const normalizedStore = this.normalizeStoreName(store)
      const expiresAt = this.calculateExpiresAt(normalizedStore)

      console.log(`[IngredientCacheTable] Caching price for ingredient ${standardizedIngredientId} at ${normalizedStore}${options?.zipCode ? ` (zip: ${options.zipCode})` : ''}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(
          {
            standardized_ingredient_id: standardizedIngredientId,
            store: normalizedStore,
            price,
            quantity,
            unit,
            unit_price: options?.unitPrice || null,
            image_url: options?.imageUrl || null,
            product_name: options?.productName || null,
            product_id: options?.productId || null,
            location: options?.location || null,
            zip_code: options?.zipCode || null,
            expires_at: expiresAt,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'standardized_ingredient_id,store,product_id,zip_code'
          }
        )
        .select()
        .single()

      if (error) {
        this.handleError(error, 'cachePrice')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'cachePrice')
      return null
    }
  }

  /**
   * Batch cache multiple prices (CRITICAL for scraper performance)
   * Uses database RPC function for 3-5x performance improvement
   * Database handles: TTL calculation, store normalization, timestamp updates
   */
  async batchCachePrices(
    items: Array<{
      standardizedIngredientId: string
      store: string
      price: number
      quantity: number
      unit: string
      unitPrice?: number | null
      imageUrl?: string | null
      productName?: string | null
      productId?: string | null
      location?: string | null
      zipCode?: string | null
    }>
  ): Promise<number> {
    try {
      if (items.length === 0) return 0

      console.log(`[IngredientCacheTable] Batch caching ${items.length} prices via RPC`)

      // Call database RPC function for bulk upsert
      // Database automatically handles:
      // - TTL calculation (fn_calculate_expires_at trigger)
      // - Store name normalization
      // - Timestamp updates (fn_update_timestamp trigger)
      const { data, error } = await this.supabase
        .rpc('bulk_cache_prices', {
          p_items: items
        })

      if (error) {
        this.handleError(error, 'batchCachePrices (RPC)')
        return 0
      }

      const count = data?.length || 0
      console.log(`[IngredientCacheTable] Successfully cached ${count} prices`)
      return count
    } catch (error) {
      this.handleError(error, 'batchCachePrices (RPC)')
      return 0
    }
  }

  /**
   * Legacy batch cache method using REST API
   * Kept for fallback if RPC function is not available
   * @deprecated Use batchCachePrices() instead (uses RPC for better performance)
   */
  async batchCachePricesLegacy(
    items: Array<{
      standardizedIngredientId: string
      store: string
      price: number
      quantity: number
      unit: string
      unitPrice?: number | null
      imageUrl?: string | null
      productName?: string | null
      productId?: string | null
      location?: string | null
      zipCode?: string | null
    }>
  ): Promise<number> {
    try {
      if (items.length === 0) return 0

      console.log(`[IngredientCacheTable] Batch caching ${items.length} prices (legacy method)`)

      const insertData = items.map(item => {
        const normalizedStore = this.normalizeStoreName(item.store)
        return {
          standardized_ingredient_id: item.standardizedIngredientId,
          store: normalizedStore,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice || null,
          image_url: item.imageUrl || null,
          product_name: item.productName || null,
          product_id: item.productId || null,
          location: item.location || null,
          zip_code: item.zipCode || null,
          expires_at: this.calculateExpiresAt(normalizedStore),
          updated_at: new Date().toISOString()
        }
      })

      const { data, error } = await this.supabase
        .from(this.tableName)
        .upsert(insertData, {
          onConflict: 'standardized_ingredient_id,store,product_id,zip_code'
        })
        .select()

      if (error) {
        this.handleError(error, 'batchCachePricesLegacy')
        return 0
      }

      return data?.length || 0
    } catch (error) {
      this.handleError(error, 'batchCachePricesLegacy')
      return 0
    }
  }

  /**
   * Search cache entries by product name (fuzzy)
   * Used for cache selection in grocery-search
   */
  async searchByProductName(
    query: string,
    stores?: string[],
    zipCode?: string | null
  ): Promise<IngredientCacheRow[]> {
    try {
      console.log(`[IngredientCacheTable] Searching products: ${query}`)

      let dbQuery = this.supabase
        .from(this.tableName)
        .select('*')
        .ilike('product_name', `%${query}%`)
        .gt('expires_at', new Date().toISOString())

      if (stores && stores.length > 0) {
        const normalizedStores = stores.map(s => this.normalizeStoreName(s))
        dbQuery = dbQuery.in('store', normalizedStores)
      }

      if (zipCode) {
        dbQuery = dbQuery.eq('zip_code', zipCode)
      }

      const { data, error } = await dbQuery.order('unit_price', { ascending: true })

      if (error) {
        this.handleError(error, 'searchByProductName')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'searchByProductName')
      return []
    }
  }

  /**
   * Clean up expired cache entries
   * Should be called periodically or via cron job
   */
  async cleanupExpired(): Promise<number> {
    try {
      console.log(`[IngredientCacheTable] Cleaning up expired entries`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select()

      if (error) {
        this.handleError(error, 'cleanupExpired')
        return 0
      }

      const count = data?.length || 0
      console.log(`[IngredientCacheTable] Cleaned up ${count} expired entries`)
      return count
    } catch (error) {
      this.handleError(error, 'cleanupExpired')
      return 0
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    totalEntries: number
    expiredEntries: number
    byStore: Record<string, number>
  }> {
    try {
      // Get total entries
      const { count: totalEntries } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })

      // Get expired entries
      const { count: expiredEntries } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .lt('expires_at', new Date().toISOString())

      // Get entries by store
      const { data: allEntries } = await this.supabase
        .from(this.tableName)
        .select('store')

      const byStore: Record<string, number> = {}
      if (allEntries) {
        for (const entry of allEntries) {
          byStore[entry.store] = (byStore[entry.store] || 0) + 1
        }
      }

      return {
        totalEntries: totalEntries || 0,
        expiredEntries: expiredEntries || 0,
        byStore
      }
    } catch (error) {
      this.handleError(error, 'getCacheStats')
      return {
        totalEntries: 0,
        expiredEntries: 0,
        byStore: {}
      }
    }
  }

  
}

export const ingredientCacheDB = IngredientCacheTable.getInstance()
