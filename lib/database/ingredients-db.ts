import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

const normalizeStoreName = (store: string): string =>
  store.toLowerCase().replace(/\s+/g, "").replace(/[']/g, "").trim()

type IngredientsHistoryRow = Database["public"]["Tables"]["ingredients_history"]["Row"]
type IngredientsHistoryInsert = Database["public"]["Tables"]["ingredients_history"]["Insert"]
type IngredientsRecentRow = Database["public"]["Tables"]["ingredients_recent"]["Row"]

class IngredientsHistoryTable extends BaseTable<
  "ingredients_history",
  IngredientsHistoryRow,
  IngredientsHistoryInsert,
  IngredientsHistoryInsert
> {
  private static instance: IngredientsHistoryTable
  readonly tableName = "ingredients_history" as const

  private constructor() {
    super()
  }

  static getInstance(): IngredientsHistoryTable {
    if (!IngredientsHistoryTable.instance) {
      IngredientsHistoryTable.instance = new IngredientsHistoryTable()
    }
    return IngredientsHistoryTable.instance
  }

  async insertPrice(payload: {
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
    standardizedUnit?: Database["public"]["Enums"]["unit_label"] | null
    groceryStoreId?: string | null
    productMappingId?: string | null
  }): Promise<IngredientsHistoryRow | null> {
    try {
      const normalizedStore = normalizeStoreName(payload.store)

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({
          standardized_ingredient_id: payload.standardizedIngredientId,
          store: normalizedStore,
          price: payload.price,
          quantity: payload.quantity,
          unit: payload.unit,
          unit_price: payload.unitPrice ?? null,
          image_url: payload.imageUrl ?? null,
          product_name: payload.productName ?? null,
          product_id: payload.productId ?? null,
          location: payload.location ?? null,
          zip_code: payload.zipCode ?? null,
          standardized_unit: payload.standardizedUnit ?? null,
          grocery_store_id: payload.groceryStoreId ?? null,
          product_mapping_id: payload.productMappingId ?? null,
        })
        .select()
        .single()

      if (error) {
        this.handleError(error, "insertPrice")
        return null
      }

      return data
    } catch (error) {
      this.handleError(error, "insertPrice")
      return null
    }
  }

  async batchInsertPrices(
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
      standardizedUnit?: Database["public"]["Enums"]["unit_label"] | null
      groceryStoreId?: string | null
      productMappingId?: string | null
    }>
  ): Promise<number> {
    try {
      if (items.length === 0) return 0

      const payload = items.map((item) => ({
        standardized_ingredient_id: item.standardizedIngredientId,
        store: normalizeStoreName(item.store),
        price: item.price,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice ?? null,
        image_url: item.imageUrl ?? null,
        product_name: item.productName ?? null,
        product_id: item.productId ?? null,
        location: item.location ?? null,
        zip_code: item.zipCode ?? null,
        standardized_unit: item.standardizedUnit ?? null,
        grocery_store_id: item.groceryStoreId ?? null,
        product_mapping_id: item.productMappingId ?? null,
      }))

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(payload)
        .select("id")

      if (error) {
        this.handleError(error, "batchInsertPrices")
        return 0
      }

      return data?.length || 0
    } catch (error) {
      this.handleError(error, "batchInsertPrices")
      return 0
    }
  }

  /**
   * Faster bulk insert via database RPC (uses server-side JSONB processing).
   * Falls back to 0 on error so callers can decide to retry with standard insert.
   */
  async batchInsertPricesRpc(
    items: Array<{
      standardizedIngredientId: string
      store: string
      price: number
      quantity: number // accepted for compatibility; RPC now ignores and defaults to 1
      unit: string
      imageUrl?: string | null
      productName?: string | null
      productId?: string | null
      location?: string | null
      zipCode?: string | null
      productMappingId?: string | null
    }>
  ): Promise<number> {
    try {
      if (!items.length) return 0

      const payload = items
        .filter((i) => i.price > 0)
        .map((item) => ({
          standardizedIngredientId: item.standardizedIngredientId,
          store: normalizeStoreName(item.store),
          price: item.price,
          // quantity intentionally omitted; DB function defaults to 1
          unit: item.unit || "unit",
          imageUrl: item.imageUrl ?? null,
          productName: item.productName ?? null,
          productId: item.productId ?? null,
          location: item.location ?? null,
          zipCode: item.zipCode ?? "",
          productMappingId: item.productMappingId ?? null,
        }))

      if (!payload.length) return 0

      const { data, error } = await this.supabase.rpc("bulk_cache_prices", {
        p_items: payload,
      })

      if (error) {
        this.handleError(error, "batchInsertPricesRpc")
        return 0
      }

      return Array.isArray(data) ? data.length : 0
    } catch (error) {
      this.handleError(error, "batchInsertPricesRpc")
      return 0
    }
  }
}

class IngredientsRecentTable extends BaseTable<"ingredients_recent", IngredientsRecentRow> {
  private static instance: IngredientsRecentTable
  readonly tableName = "ingredients_recent" as const

  private constructor() {
    super()
  }

  static getInstance(): IngredientsRecentTable {
    if (!IngredientsRecentTable.instance) {
      IngredientsRecentTable.instance = new IngredientsRecentTable()
    }
    return IngredientsRecentTable.instance
  }

  async findByStandardizedId(
    standardizedIngredientId: string,
    stores?: string[],
    zipCode?: string | null
  ): Promise<IngredientsRecentRow[]> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select("*")
        .eq("standardized_ingredient_id", standardizedIngredientId)

      if (stores && stores.length > 0) {
        const normalizedStores = stores.map(normalizeStoreName)
        query = query.in("store", normalizedStores)
      }

      if (zipCode) {
        query = query.eq("zip_code", zipCode)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) {
        this.handleError(error, "findByStandardizedId")
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, "findByStandardizedId")
      return []
    }
  }

  async findByStandardizedIds(
    standardizedIngredientIds: string[],
    stores?: string[],
    zipCode?: string | null
  ): Promise<IngredientsRecentRow[]> {
    try {
      if (standardizedIngredientIds.length === 0) return []

      let query = this.supabase
        .from(this.tableName)
        .select("*")
        .in("standardized_ingredient_id", standardizedIngredientIds)

      if (stores && stores.length > 0) {
        const normalizedStores = stores.map(normalizeStoreName)
        query = query.in("store", normalizedStores)
      }

      if (zipCode) {
        query = query.eq("zip_code", zipCode)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) {
        this.handleError(error, "findByStandardizedIds")
        return []
      }

      return data || []
    } catch (error) {
      this.handleError(error, "findByStandardizedIds")
      return []
    }
  }
}

export const ingredientsHistoryDB = IngredientsHistoryTable.getInstance()
export const ingredientsRecentDB = IngredientsRecentTable.getInstance()
export { normalizeStoreName }
