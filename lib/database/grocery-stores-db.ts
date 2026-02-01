import { BaseTable } from "./base-db"
import type { Database } from "./supabase"

/**
 * Type aliases for grocery_stores table
 */
type GroceryStoreRow = Database["public"]["Tables"]["grocery_stores"]["Row"]
type GroceryStoreInsert = Database["public"]["Tables"]["grocery_stores"]["Insert"]
type GroceryStoreUpdate = Database["public"]["Tables"]["grocery_stores"]["Update"]

/**
 * Extended type for stores with distance data from spatial queries
 */
export type StoreWithDistance = GroceryStoreRow & {
  lat: number
  lng: number
  distance_meters: number
  distance_miles: number
}

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

  /**
   * Find stores within a radius of given coordinates using PostGIS spatial query
   * @param lat - Latitude
   * @param lng - Longitude
   * @param radiusMiles - Search radius in miles (default: 10)
   * @param storeEnum - Optional filter by specific store brand
   */
  async findNearby(
    lat: number,
    lng: number,
    radiusMiles: number = 10,
    storeEnum?: Database["public"]["Enums"]["grocery_store"]
  ): Promise<StoreWithDistance[]> {
    const radiusMeters = radiusMiles * 1609.34

    const { data, error } = await this.supabase.rpc("find_nearby_stores", {
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: radiusMeters,
      p_store_enum: storeEnum || null,
    })

    if (error) {
      this.handleError(error, `findNearby(${lat}, ${lng}, ${radiusMiles}, ${storeEnum})`)
      return []
    }

    return (data || []) as StoreWithDistance[]
  }

  /**
   * Find the closest store of a specific brand to given coordinates
   * @param lat - Latitude
   * @param lng - Longitude
   * @param storeEnum - Store brand to search for
   * @param radiusMiles - Maximum search radius in miles (default: 10)
   */
  async findClosest(
    lat: number,
    lng: number,
    storeEnum: Database["public"]["Enums"]["grocery_store"],
    radiusMiles: number = 10
  ): Promise<StoreWithDistance | null> {
    const stores = await this.findNearby(lat, lng, radiusMiles, storeEnum)
    return stores.length > 0 ? stores[0] : null
  }

  /**
   * Find the closest store for each of multiple brands
   * Returns a map of store_enum -> store data
   * @param lat - Latitude
   * @param lng - Longitude
   * @param storeEnums - Array of store brands to search for
   * @param radiusMiles - Maximum search radius in miles (default: 10)
   */
  async findClosestForBrands(
    lat: number,
    lng: number,
    storeEnums: Database["public"]["Enums"]["grocery_store"][],
    radiusMiles: number = 10
  ): Promise<Map<string, StoreWithDistance>> {
    const result = new Map<string, StoreWithDistance>()

    // Get all nearby stores first (single query)
    const allStores = await this.findNearby(lat, lng, radiusMiles)

    // Group by store_enum and take the closest for each
    for (const storeEnum of storeEnums) {
      const storesForBrand = allStores.filter((s) => s.store_enum === storeEnum)
      if (storesForBrand.length > 0) {
        // Already sorted by distance, so first is closest
        result.set(storeEnum, storesForBrand[0])
      }
    }

    return result
  }

  /**
   * Find stores near an authenticated user's profile location
   * Uses the user's stored latitude/longitude from their profile
   * @param userId - User's UUID from auth.users
   * @param storeEnum - Optional filter by specific store brand
   * @param radiusMiles - Search radius in miles (default: 10)
   */
  async findStoresNearUser(
    userId: string,
    storeEnum?: Database["public"]["Enums"]["grocery_store"],
    radiusMiles: number = 10
  ): Promise<StoreWithDistance[]> {
    const radiusMeters = radiusMiles * 1609.34

    const { data, error } = await this.supabase.rpc("find_stores_near_user", {
      p_user_id: userId,
      p_radius_meters: radiusMeters,
      p_store_enum: storeEnum || null,
    })

    if (error) {
      this.handleError(error, `findStoresNearUser(${userId}, ${storeEnum}, ${radiusMiles})`)
      return []
    }

    return (data || []) as StoreWithDistance[]
  }
}

// Export singleton instance
export const groceryStoresDB = GroceryStoresTable.getInstance()
