
import { BaseTable } from './base-db'
import type { Database } from '@/lib/supabase'

type PantryItemRow = Database['public']['Tables']['pantry_items']['Row']
type PantryItemInsert = Database['public']['Tables']['pantry_items']['Insert']
type PantryItemUpdate = Database['public']['Tables']['pantry_items']['Update']

class PantryItemsTable extends BaseTable<
  'pantry_items',
  PantryItemRow,
  PantryItemInsert,
  PantryItemUpdate
> {
  private static instance: PantryItemsTable
  readonly tableName = 'pantry_items' as const

  private constructor() {
    super()
  }

  static getInstance(): PantryItemsTable {
    if (!PantryItemsTable.instance) {
      PantryItemsTable.instance = new PantryItemsTable()
    }
    return PantryItemsTable.instance
  }

  /**
   * Get all pantry items for a user
   * Primary query used by pantry page
   */
  async findByUserId(
    userId: string,
    options?: {
      category?: string
      includeExpired?: boolean
      sortBy?: 'name' | 'expiry_date' | 'created_at'
    }
  ): Promise<PantryItemRow[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)

      if (options?.category) {
        query = query.eq('category', options.category)
      }

      if (!options?.includeExpired) {
        query = query.or(`expiry_date.is.null,expiry_date.gte.${new Date().toISOString()}`)
      }

      // Sort order
      const sortBy = options?.sortBy || 'created_at'
      query = query.order(sortBy, { ascending: sortBy === 'name' })

      const { data, error } = await query

      if (error) {
        this.handleError(error, 'findByUserId')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findByUserId')
      return []
    }
  }

  /**
   * Get items expiring soon (within N days)
   * Used for expiration notifications
   */
  async findExpiringSoon(
    userId: string,
    daysAhead: number = 3
  ): Promise<PantryItemRow[]> {
    try {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + daysAhead)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .not('expiry_date', 'is', null)
        .gte('expiry_date', new Date().toISOString())
        .lte('expiry_date', futureDate.toISOString())
        .order('expiry_date', { ascending: true })

      if (error) {
        this.handleError(error, 'findExpiringSoon')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findExpiringSoon')
      return []
    }
  }

  /**
   * Get expired items
   * Used for cleanup and notifications
   */
  async findExpired(userId: string): Promise<PantryItemRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .not('expiry_date', 'is', null)
        .lt('expiry_date', new Date().toISOString())
        .order('expiry_date', { ascending: true })

      if (error) {
        this.handleError(error, 'findExpired')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'findExpired')
      return []
    }
  }

  /**
   * Get items by category
   */
  async findByCategory(
    userId: string,
    category: string
  ): Promise<PantryItemRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('name', { ascending: true })

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
   * Get items by standardized ingredient ID
   * Used for recipe matching
   */
  async findByStandardizedId(
    userId: string,
    standardizedIngredientId: string
  ): Promise<PantryItemRow[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
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
   * Batch fetch items by standardized IDs
   * Used for recipe ingredient matching
   */
  async findByStandardizedIds(
    userId: string,
    standardizedIngredientIds: string[]
  ): Promise<PantryItemRow[]> {
    try {
      if (standardizedIngredientIds.length === 0) return []

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .in('standardized_ingredient_id', standardizedIngredientIds)

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
   * Update item quantity (increment/decrement)
   * Used when using ingredients from pantry
   */
  async updateQuantity(
    itemId: string,
    quantityDelta: number
  ): Promise<PantryItemRow | null> {
    try {
      console.log(`[PantryItemsTable] Updating quantity for item ${itemId} by ${quantityDelta}`)

      // First, get the current item
      const current = await this.findById(itemId)
      if (!current) {
        console.log(`[PantryItemsTable] Item ${itemId} not found`)
        return null
      }

      const newQuantity = (current.quantity || 0) + quantityDelta

      // Don't allow negative quantities
      if (newQuantity < 0) {
        console.log(`[PantryItemsTable] Cannot set negative quantity for item ${itemId}`)
        return null
      }

      // Update the quantity
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single()

      if (error) {
        this.handleError(error, 'updateQuantity')
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, 'updateQuantity')
      return null
    }
  }

  /**
   * Batch add items (from shopping list)
   */
  async batchCreate(items: PantryItemInsert[]): Promise<PantryItemRow[]> {
    try {
      if (items.length === 0) return []

      console.log(`[PantryItemsTable] Batch creating ${items.length} pantry items`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(items)
        .select()

      if (error) {
        this.handleError(error, 'batchCreate')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'batchCreate')
      return []
    }
  }

  /**
   * Delete expired items (bulk cleanup)
   */
  async deleteExpired(userId: string): Promise<number> {
    try {
      console.log(`[PantryItemsTable] Deleting expired items for user ${userId}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('user_id', userId)
        .not('expiry_date', 'is', null)
        .lt('expiry_date', new Date().toISOString())
        .select()

      if (error) {
        this.handleError(error, 'deleteExpired')
        return 0
      }

      const count = data?.length || 0
      console.log(`[PantryItemsTable] Deleted ${count} expired items`)
      return count
    } catch (error) {
      this.handleError(error, 'deleteExpired')
      return 0
    }
  }

  /**
   * Override update to automatically update updated_at
   */
  async update(id: string, updates: PantryItemUpdate): Promise<PantryItemRow | null> {
    return super.update(id, {
      ...updates,
      updated_at: new Date().toISOString()
    } as PantryItemUpdate)
  }

  /**
   * Search pantry items by name
   */
  async searchByName(userId: string, query: string): Promise<PantryItemRow[]> {
    try {
      console.log(`[PantryItemsTable] Searching for: ${query}`)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${query}%`)
        .order('name', { ascending: true })

      if (error) {
        this.handleError(error, 'searchByName')
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, 'searchByName')
      return []
    }
  }

  /**
   * Delete all items for a user
   */
  async deleteByUserId(userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('user_id', userId)

      if (error) {
        this.handleError(error, 'deleteByUserId')
        return false
      }

      return true
    } catch (error) {
      this.handleError(error, 'deleteByUserId')
      return false
    }
  }

  /**
   * Get pantry statistics
   * Used for dashboard/insights
   */
  async getStats(userId: string): Promise<{
    totalItems: number
    expiringCount: number
    expiredCount: number
    byCategory: Record<string, number>
  }> {
    try {
      // Get all items for the user
      const items = await this.findByUserId(userId, { includeExpired: true })

      const now = new Date()
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 3)

      let expiringCount = 0
      let expiredCount = 0
      const byCategory: Record<string, number> = {}

      for (const item of items) {
        // Count by category
        const category = item.category || 'Uncategorized'
        byCategory[category] = (byCategory[category] || 0) + 1

        // Count expiring/expired
        if (item.expiry_date) {
          const expiryDate = new Date(item.expiry_date)
          if (expiryDate < now) {
            expiredCount++
          } else if (expiryDate <= futureDate) {
            expiringCount++
          }
        }
      }

      return {
        totalItems: items.length,
        expiringCount,
        expiredCount,
        byCategory
      }
    } catch (error) {
      this.handleError(error, 'getStats')
      return {
        totalItems: 0,
        expiringCount: 0,
        expiredCount: 0,
        byCategory: {}
      }
    }
  }
}

export const pantryItemsDB = PantryItemsTable.getInstance()
