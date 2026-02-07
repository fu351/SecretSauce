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
   *
   * Note:
   * - standardizedIngredientId matching is handled by the database based on product_name
   * - quantity and unit are extracted by the database from product_name
   * - location is deprecated (zipCode is used instead)
   */
  async batchInsertPricesRpc(
    items: Array<{
      store: string
      price: number
      imageUrl?: string | null
      productName?: string | null
      productId?: string | null
      zipCode?: string | null
      groceryStoreId?: string | null
    }>
  ): Promise<number> {
    try {
      if (!items.length) return 0

      const payload = items
        .filter((i) => i.price > 0 && i.productName)
        .map((item) => ({
          store: normalizeStoreName(item.store),
          price: item.price,
          imageUrl: item.imageUrl ?? null,
          productName: item.productName ?? null,
          productId: item.productId ?? null,
          zipCode: item.zipCode ?? "",
          store_id: item.groceryStoreId ?? null,
        }))

      if (!payload.length) return 0

      const { data, error } = await (this.supabase.rpc as any)("fn_bulk_insert_ingredient_history", {
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

  /**
   * Fuzzy-match a batch of product names against standardized_ingredients.
   * Calls fn_preview_ingredient_match which uses trigram similarity with
   * substring fallback. Returns a map of productName -> matched ingredient UUID.
   * Rows where no match was found (matched_id IS NULL) are omitted.
   */
  async previewStandardization(
    items: Array<{
      productName: string
      standardizedIngredientId?: string | null
    }>
  ): Promise<Map<string, string>> {
    try {
      if (!items.length) return new Map()

      const payload = items.map((item) => ({
        productName: item.productName,
      }))

      const { data, error } = await (this.supabase.rpc as any)("fn_preview_ingredient_match", {
        p_items: payload,
      })

      if (error) {
        this.handleError(error, "previewStandardization")
        return new Map()
      }

      const result = new Map<string, string>()
      ;(data || []).forEach((row: any) => {
        if (row.input_name && row.matched_id) {
          result.set(row.input_name, row.matched_id)
        }
      })
      return result
    } catch (error) {
      this.handleError(error, "previewStandardization")
      return new Map()
    }
  }

  /**
   * Bulk insert with full standardization and product-mapping creation via RPC.
   * Uses fn_bulk_standardize_and_match which:
   *  - Resolves standardized_ingredient_id (uses manual value if provided, else fuzzy match)
   *  - Extracts quantity/unit from product name
   *  - Upserts into product_mappings (creates the row needed for checkout)
   *  - Inserts into ingredients_history with product_mapping_id set
   * Falls back to 0 on error so callers can decide to retry.
   */
  async batchStandardizeAndMatch(
    items: Array<{
      standardizedIngredientId?: string | null
      store: string
      price: number
      productName?: string | null
      productId?: string | null
      zipCode?: string | null
      groceryStoreId?: string | null
    }>
  ): Promise<number> {
    try {
      if (!items.length) return 0

      const payload = items
        .filter((i) => i.price > 0)
        .map((item) => ({
          standardizedIngredientId: item.standardizedIngredientId ?? null,
          store: normalizeStoreName(item.store),
          price: item.price,
          productName: item.productName ?? null,
          productId: item.productId ?? null,
          zipCode: item.zipCode ?? "",
          store_id: item.groceryStoreId ?? null,
        }))

      if (!payload.length) return 0

      const { data, error } = await (this.supabase.rpc as any)("fn_bulk_standardize_and_match", {
        p_items: payload,
      })

      if (error) {
        this.handleError(error, "batchStandardizeAndMatch")
        return 0
      }

      return Array.isArray(data) ? data.length : 0
    } catch (error) {
      this.handleError(error, "batchStandardizeAndMatch")
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

  /**
   * Fetch enriched price options for a single ingredient across user's preferred stores.
   * Wraps get_ingredient_price_details RPC. Each offer includes product_mapping_id,
   * which is what fn_add_to_delivery_log needs at checkout.
   */
  async getIngredientPriceDetails(
    userId: string,
    standardizedIngredientId: string,
    quantity: number = 1
  ): Promise<Array<{
    store: string
    productMappingId: string | null
    unitPrice: number | null
    packagePrice: number | null
    totalPrice: number | null
    packagesToBuy: number | null
    productName: string | null
    imageUrl: string | null
    distance: number | null
  }>> {
    try {
      const { data, error } = await (this.supabase.rpc as any)("get_ingredient_price_details", {
        p_user_id: userId,
        p_standardized_ingredient_id: standardizedIngredientId,
        p_quantity: quantity,
      })

      if (error) {
        this.handleError(error, "getIngredientPriceDetails")
        return []
      }

      // RPC returns JSONB: [{ standardized_ingredient_id, offers: [...] }]
      const entries = Array.isArray(data) ? data : []
      return entries.flatMap((entry: any) =>
        (entry.offers || []).map((offer: any) => ({
          store: offer.store || "",
          productMappingId: offer.product_mapping_id || null,
          unitPrice: offer.unit_price != null ? Number(offer.unit_price) : null,
          packagePrice: offer.package_price != null ? Number(offer.package_price) : null,
          totalPrice: offer.total_price != null ? Number(offer.total_price) : null,
          packagesToBuy: offer.packages_to_buy != null ? Number(offer.packages_to_buy) : null,
          productName: offer.product_name || null,
          imageUrl: offer.image_url || null,
          distance: offer.distance != null ? Number(offer.distance) : null,
        }))
      )
    } catch (error) {
      this.handleError(error, "getIngredientPriceDetails")
      return []
    }
  }

  async getPricingForUser(userId: string): Promise<PricingResult[]> {
    try {
      const { data, error } = await (this.supabase.rpc as any)("get_pricing", {
        p_user_id: userId,
      })

      if (error) {
        this.handleError(error, "getPricingForUser")
        return []
      }

      return Array.isArray(data) ? data : []
    } catch (error) {
      this.handleError(error, "getPricingForUser")
      return []
    }
  }
}

export type PricingResult = {
  standardized_ingredient_id: string
  total_quantity: number
  item_ids: string[]
  offers: {
    store: string
    store_id?: string | null
    store_name?: string | null
    product_mapping_id?: string | null
    unit_price: number | null
    total_price: number | null
    product_name?: string | null
    image_url?: string | null
    zip_code?: string | null
    distance?: number | null
  }[]
}

export const ingredientsHistoryDB = IngredientsHistoryTable.getInstance()
export const ingredientsRecentDB = IngredientsRecentTable.getInstance()
export { normalizeStoreName }
