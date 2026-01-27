import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

/**
 * Type aliases for grocery_stores table
 */
type GroceryStoreRow = Database["public"]["Tables"]["grocery_stores"]["Row"]
type GroceryStoreInsert = Database["public"]["Tables"]["grocery_stores"]["Insert"]
type GroceryStoreUpdate = Database["public"]["Tables"]["grocery_stores"]["Update"]

/**
 * Database operations for grocery_stores
 * Singleton class extending BaseTable for managing grocery store locations
 */
class GroceryStoresTable extends BaseTable<
  "grocery_stores",
  GroceryStoreRow,
  GroceryStoreInsert,
  GroceryStoreUpdate
> {
  private static instance: GroceryStoresTable | null = null
  readonly tableName = "grocery_stores" as const

  private constructor() {
    super()
  }

  static getInstance(): GroceryStoresTable {
    if (!GroceryStoresTable.instance) {
      GroceryStoresTable.instance = new GroceryStoresTable()
    }
    return GroceryStoresTable.instance
  }

  /**
   * Map raw database row to typed GroceryStoreRow
   */
  protected map(dbItem: any): GroceryStoreRow {
    return {
      id: dbItem.id,
      store_enum: dbItem.store_enum,
      name: dbItem.name,
      address: dbItem.address,
      zip_code: dbItem.zip_code,
      geom: dbItem.geom,
      is_active: dbItem.is_active,
      created_at: dbItem.created_at,
    }
  }

  /**
   * Find stores by store enum (e.g., all Walmart locations)
   */
  async findByStoreEnum(
    storeEnum: Database["public"]["Enums"]["grocery_store"]
  ): Promise<GroceryStoreRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("store_enum", storeEnum)
      .eq("is_active", true)

    if (error) {
      this.handleError(error, `findByStoreEnum(${storeEnum})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Find stores by zip code
   */
  async findByZipCode(zipCode: string): Promise<GroceryStoreRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("zip_code", zipCode)
      .eq("is_active", true)

    if (error) {
      this.handleError(error, `findByZipCode(${zipCode})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Find stores by store enum and zip code
   */
  async findByStoreAndZip(
    storeEnum: Database["public"]["Enums"]["grocery_store"],
    zipCode: string
  ): Promise<GroceryStoreRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("store_enum", storeEnum)
      .eq("zip_code", zipCode)
      .eq("is_active", true)

    if (error) {
      this.handleError(error, `findByStoreAndZip(${storeEnum}, ${zipCode})`)
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Find all active stores
   */
  async findAllActive(): Promise<GroceryStoreRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("is_active", true)

    if (error) {
      this.handleError(error, "findAllActive()")
      return []
    }

    return (data || []).map((d) => this.map(d))
  }

  /**
   * Create a new grocery store location
   */
  async createStore(insertData: GroceryStoreInsert): Promise<GroceryStoreRow | null> {
    return this.create(insertData)
  }

  /**
   * Update a grocery store location
   */
  async updateStore(id: string, updateData: GroceryStoreUpdate): Promise<GroceryStoreRow | null> {
    return this.update(id, updateData)
  }

  /**
   * Deactivate a store (soft delete by setting is_active to false)
   */
  async deactivateStore(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ is_active: false })
      .eq("id", id)

    if (error) {
      this.handleError(error, `deactivateStore(${id})`)
      return false
    }

    return true
  }

  /**
   * Reactivate a store
   */
  async reactivateStore(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ is_active: true })
      .eq("id", id)

    if (error) {
      this.handleError(error, `reactivateStore(${id})`)
      return false
    }

    return true
  }
}

// Export singleton instance
export const groceryStoresDB = GroceryStoresTable.getInstance()
