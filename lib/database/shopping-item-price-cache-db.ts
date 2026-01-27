import { BaseTable } from './base-db'
import type { Database } from '@/lib/database/supabase'

const normalizeNumeric = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

type ShoppingItemPriceCacheRow = Database['public']['Tables']['shopping_item_price_cache']['Row']
type ShoppingItemPriceCacheInsert = Database['public']['Tables']['shopping_item_price_cache']['Insert']
type ShoppingItemPriceCacheUpdate = Database['public']['Tables']['shopping_item_price_cache']['Update']
type GroceryStore = Database['public']['Enums']['grocery_store']

type PricingOffer = {
  store: string
  store_id?: string | null
  store_name?: string | null
  unit_price: number | null
  total_price: number | null
  product_name?: string | null
  image_url?: string | null
  zip_code?: string | null
  distance?: number | null
}

export type PricingResult = {
  standardized_ingredient_id: string
  total_quantity: number
  item_ids: string[]
  offers: PricingOffer[]
}

class ShoppingItemPriceCacheTable extends BaseTable<
  'shopping_item_price_cache',
  ShoppingItemPriceCacheRow,
  ShoppingItemPriceCacheInsert,
  ShoppingItemPriceCacheUpdate
> {
  private static instance: ShoppingItemPriceCacheTable | null = null
  readonly tableName = 'shopping_item_price_cache' as const

  private constructor() {
    super()
  }

  static getInstance(): ShoppingItemPriceCacheTable {
    if (!ShoppingItemPriceCacheTable.instance) {
      ShoppingItemPriceCacheTable.instance = new ShoppingItemPriceCacheTable()
    }
    return ShoppingItemPriceCacheTable.instance
  }

  protected map(data: any): ShoppingItemPriceCacheRow {
    return {
      ...data,
      price: normalizeNumeric(data.price),
      unit_price: normalizeNumeric(data.unit_price),
    }
  }

  async fetchByItem(shoppingListItemId: string): Promise<ShoppingItemPriceCacheRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('shopping_list_item_id', shoppingListItemId)
      .order('cached_at', { ascending: false })

    if (error) {
      this.handleError(error, 'fetchByItem')
      return []
    }

    return (data || []).map((row) => this.map(row))
  }

  async fetchByItemAtLocation(
    shoppingListItemId: string,
    store: GroceryStore,
    zipCode: string
  ): Promise<ShoppingItemPriceCacheRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('shopping_list_item_id', shoppingListItemId)
      .eq('store', store)
      .eq('zip_code', zipCode)
      .maybeSingle()

    if (error) {
      this.handleError(error, 'fetchByItemAtLocation')
      return null
    }

    return data ? this.map(data) : null
  }

  /**
   * Batch fetch cache rows for multiple shopping list items.
   * Returns rows sorted by most recent cache time.
   */
  async fetchByItemIds(
    shoppingListItemIds: string[],
    zipCode?: string | null
  ): Promise<ShoppingItemPriceCacheRow[]> {
    if (!shoppingListItemIds.length) return []

    let query = this.supabase
      .from(this.tableName)
      .select("*")
      .in("shopping_list_item_id", shoppingListItemIds)
      .order("cached_at", { ascending: false })

    if (zipCode) {
      query = query.eq("zip_code", zipCode)
    }

    const { data, error } = await query

    if (error) {
      this.handleError(error, "fetchByItemIds")
      return []
    }

    return (data || []).map((row) => this.map(row))
  }

  async upsertCache(entry: ShoppingItemPriceCacheInsert): Promise<ShoppingItemPriceCacheRow | null> {
    const payload = {
      ...entry,
      cached_at: entry.cached_at || new Date().toISOString(),
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .upsert(payload, { onConflict: 'shopping_list_item_id,store,zip_code' })
      .select('*')
      .single()

    if (error) {
      this.handleError(error, 'upsertCache')
      return null
    }

    return data ? this.map(data) : null
  }

  async deleteByItem(shoppingListItemId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('shopping_list_item_id', shoppingListItemId)

    if (error) {
      this.handleError(error, 'deleteByItem')
      return false
    }

    return true
  }

  /**
   * Server-side pricing aggregation for a user's shopping list.
   * Wraps the `get_pricing` Postgres function.
   */
  async getPricingForUser(userId: string): Promise<PricingResult[]> {
    if (!userId) return []

    const { data, error } = await this.supabase.rpc('get_pricing', { p_user_id: userId })

    if (error) {
      this.handleError(error, 'getPricingForUser')
      return []
    }

    return Array.isArray(data) ? (data as PricingResult[]) : []
  }
}

export const shoppingItemPriceCacheDB = ShoppingItemPriceCacheTable.getInstance()
