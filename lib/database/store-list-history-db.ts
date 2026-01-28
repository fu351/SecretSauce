import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

/**
 * Type aliases for store_list_history table
 */
type StoreListHistoryRow = Database["public"]["Tables"]["store_list_history"]["Row"]
type StoreListHistoryInsert = Database["public"]["Tables"]["store_list_history"]["Insert"]
type StoreListHistoryUpdate = Database["public"]["Tables"]["store_list_history"]["Update"]

/**
 * Database operations for store_list_history
 * Singleton class extending BaseTable for managing delivery log entries
 *
 * ARCHITECTURE NOTE:
 * - shopping_item_price_cache = Pre-computed cheapest option per store (for UI display)
 * - ingredients_recent = Full catalog of available products (allows user swaps)
 * - This table = Delivery log tracking what users have selected for delivery
 */
class StoreListHistoryTable extends BaseTable<
  "store_list_history",
  StoreListHistoryRow,
  StoreListHistoryInsert,
  StoreListHistoryUpdate
> {
  private static instance: StoreListHistoryTable | null = null
  readonly tableName = "store_list_history" as const

  private constructor() {
    super()
  }

  static getInstance(): StoreListHistoryTable {
    if (!StoreListHistoryTable.instance) {
      StoreListHistoryTable.instance = new StoreListHistoryTable()
    }
    return StoreListHistoryTable.instance
  }

  /**
   * Map raw database row to typed StoreListHistoryRow
   */
  protected map(dbItem: any): StoreListHistoryRow {
    return {
      id: dbItem.id,
      user_id: dbItem.user_id,
      grocery_store_id: dbItem.grocery_store_id,
      standardized_ingredient_id: dbItem.standardized_ingredient_id,
      unit_price_at_selection: dbItem.unit_price_at_selection,
      quantity_needed: dbItem.quantity_needed,
      total_item_price: dbItem.total_item_price,
      week_index: dbItem.week_index,
      is_delivery_confirmed: dbItem.is_delivery_confirmed,
      expires_at: dbItem.expires_at,
      created_at: dbItem.created_at,
      updated_at: dbItem.updated_at,
      delivery_date: dbItem.delivery_date,
    }
  }

  /**
   * Add a product from ingredients_recent to the delivery log
   * Calls fn_add_to_delivery_log RPC function
   *
   * This function:
   * - Accepts ANY product from ingredients_recent (not just cached ones)
   * - Validates the product matches the shopping list item's ingredient
   * - Creates or updates the delivery log entry
   * - Accumulates quantity on conflicts
   *
   * @param shoppingListItemId - UUID of the shopping list item
   * @param productMappingId - UUID of the product mapping from ingredients_recent
   * @param deliveryDate - Optional delivery date (defaults to today)
   * @returns UUID of the created/updated log entry, or null on error
   */
  async addToDeliveryLog(
    shoppingListItemId: string,
    productMappingId: string,
    deliveryDate?: string
  ): Promise<string | null> {
    console.log(
      `[Store List History DB] Adding to delivery log: shopping_item=${shoppingListItemId}, product=${productMappingId}, date=${deliveryDate || "today"}`
    )

    const { data, error } = await this.supabase.rpc("fn_add_to_delivery_log", {
      p_shopping_list_item_id: shoppingListItemId,
      p_product_mapping_id: productMappingId,
      p_delivery_date: deliveryDate || null,
    })

    if (error) {
      this.handleError(error, "addToDeliveryLog")
      return null
    }

    console.log(`[Store List History DB] Successfully added to delivery log: ${data}`)
    return data
  }

  /**
   * Get delivery log entries for a user
   */
  async findByUserId(userId: string, options?: { limit?: number }): Promise<StoreListHistoryRow[]> {
    let query = this.supabase.from(this.tableName).select("*").eq("user_id", userId)

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      this.handleError(error, `findByUserId(${userId})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Get delivery log entries for a user and week
   */
  async findByUserAndWeek(userId: string, weekIndex: number): Promise<StoreListHistoryRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("week_index", weekIndex)

    if (error) {
      this.handleError(error, `findByUserAndWeek(${userId}, ${weekIndex})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Get delivery log entries for a user, store, and week
   */
  async findByUserStoreAndWeek(
    userId: string,
    groceryStoreId: string,
    weekIndex: number
  ): Promise<StoreListHistoryRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("grocery_store_id", groceryStoreId)
      .eq("week_index", weekIndex)

    if (error) {
      this.handleError(error, `findByUserStoreAndWeek(${userId}, ${groceryStoreId}, ${weekIndex})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Get delivery log entries for a specific delivery date
   */
  async findByDeliveryDate(userId: string, deliveryDate: string): Promise<StoreListHistoryRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("delivery_date", deliveryDate)

    if (error) {
      this.handleError(error, `findByDeliveryDate(${userId}, ${deliveryDate})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Get unconfirmed delivery log entries for a user
   */
  async findUnconfirmed(userId: string): Promise<StoreListHistoryRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .eq("is_delivery_confirmed", false)

    if (error) {
      this.handleError(error, `findUnconfirmed(${userId})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Get all delivery log entries for a specific order
   */
  async findByOrderId(orderId: string): Promise<StoreListHistoryRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("order_id", orderId)

    if (error) {
      this.handleError(error, `findByOrderId(${orderId})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Confirm delivery for log entries
   */
  async confirmDelivery(logIds: string[]): Promise<boolean> {
    if (logIds.length === 0) return true

    const { error } = await this.supabase
      .from(this.tableName)
      .update({ is_delivery_confirmed: true })
      .in("id", logIds)

    if (error) {
      this.handleError(error, `confirmDelivery([${logIds.join(", ")}])`)
      return false
    }

    return true
  }

  /**
   * Delete expired entries
   */
  async deleteExpired(): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id")

    if (error) {
      this.handleError(error, "deleteExpired")
      return 0
    }

    return data?.length || 0
  }

  /**
   * Calculate total cost for a delivery log entry
   * Note: total_item_price is a generated column (unit_price * quantity)
   */
  async calculateTotalForUser(userId: string, weekIndex?: number): Promise<number> {
    let query = this.supabase
      .from(this.tableName)
      .select("total_item_price")
      .eq("user_id", userId)

    if (weekIndex !== undefined) {
      query = query.eq("week_index", weekIndex)
    }

    const { data, error } = await query

    if (error) {
      this.handleError(error, `calculateTotalForUser(${userId}, ${weekIndex})`)
      return 0
    }

    return (data || []).reduce((sum, item) => sum + (item.total_item_price || 0), 0)
  }

  /**
   * Get delivery log entries grouped by store
   */
  async findGroupedByStore(
    userId: string,
    weekIndex: number
  ): Promise<Record<string, StoreListHistoryRow[]>> {
    const entries = await this.findByUserAndWeek(userId, weekIndex)

    return entries.reduce((acc, entry) => {
      const storeId = entry.grocery_store_id
      if (!acc[storeId]) {
        acc[storeId] = []
      }
      acc[storeId].push(entry)
      return acc
    }, {} as Record<string, StoreListHistoryRow[]>)
  }
}

// Export singleton instance
export const storeListHistoryDB = StoreListHistoryTable.getInstance()
