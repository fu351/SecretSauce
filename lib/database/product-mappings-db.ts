import { supabase, type Database } from "@/lib/database/supabase"
import {
  GROCERY_STORE_ENUM_SET,
  normalizeStoreName,
  resolveParentGroceryStoreEnum,
} from "@/lib/store/open-prices-store-map"

function resolveStoreBrand(
  value: string | Database["public"]["Enums"]["grocery_store"] | null | undefined
): Database["public"]["Enums"]["grocery_store"] | null {
  if (!value) return null
  const normalized = normalizeStoreName(value)
  if (GROCERY_STORE_ENUM_SET.has(normalized as Database["public"]["Enums"]["grocery_store"])) {
    return normalized as Database["public"]["Enums"]["grocery_store"]
  }
  return resolveParentGroceryStoreEnum(value)
}

type ProductMappingInsert = {
  external_product_id: string
  store_brand: Database["public"]["Enums"]["grocery_store"]
  raw_product_name?: string | null
  standardized_ingredient_id?: string | null
  ingredient_confidence?: number | null
  standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
  standardized_quantity?: number | null
  unit_confidence?: number | null
  quantity_confidence?: number | null
  manual_override?: boolean | null
  last_seen_at?: string | null
  modal_opened_count?: number | null
  exchange_count?: number | null
}

class ProductMappingsTable {
  readonly tableName = "product_mappings" as const

  /**
   * Upsert a batch of product mappings and return a map of external_product_id -> mapping id
   * Uses the unique constraint on (external_product_id, store_brand[, zip_code]).
   */
  async upsertMappings(
    mappings: ProductMappingInsert[]
  ): Promise<Map<string, string>> {
    if (!mappings.length) return new Map()

    // Use plain insert instead of upsert since unique constraint doesn't exist
    // Duplicate inserts will be silently ignored
    const { data, error } = await (supabase as any)
      .from(this.tableName)
      .insert(mappings)
      .select("id, external_product_id, store_brand")

    if (error) {
      // Log but don't fail - duplicates are expected
      console.warn("[ProductMappingsTable] insert mappings warning (duplicates expected)", error.code)
      return new Map()
    }

    const map = new Map<string, string>()
    ;(data || []).forEach((row: any) => {
      const key = `${row.external_product_id}::${row.store_brand || ""}`
      map.set(key, row.id)
    })
    return map
  }

  /**
   * Increment counters for a single product mapping, creating the row if needed.
   */
  async incrementCounts(options: {
    external_product_id: string
    store?: string | null
    store_brand?: string | Database["public"]["Enums"]["grocery_store"] | null
    raw_product_name?: string | null
    standardized_ingredient_id?: string | null
    modal_delta?: number
    exchange_delta?: number
  }): Promise<string | null> {
    const {
      external_product_id,
      store = null,
      store_brand = null,
      raw_product_name = null,
      standardized_ingredient_id = null,
      modal_delta = 0,
      exchange_delta = 0,
    } = options

    const resolvedStoreBrand = resolveStoreBrand(store_brand ?? store ?? null)
    if (!resolvedStoreBrand) {
      console.warn("[ProductMappingsTable] incrementCounts skipped: missing store_brand", {
        external_product_id,
        store_brand,
        store,
      })
      return null
    }

    // 1) Find or create mapping row (best-effort; may be constrained by RLS)
    const query = (supabase as any)
      .from(this.tableName)
      .select("id")
      .eq("external_product_id", external_product_id)
      .eq("store_brand", resolvedStoreBrand)
      .limit(1)

    const { data: existing, error: findErr } = await query
    if (findErr) {
      console.error("[ProductMappingsTable] incrementCounts find failed", findErr)
    }

    let mappingId = existing?.[0]?.id as string | undefined

    if (!mappingId) {
      const basePayload: ProductMappingInsert = {
        external_product_id,
        store_brand: resolvedStoreBrand,
        raw_product_name,
        standardized_ingredient_id,
        last_seen_at: new Date().toISOString(),
      }

      const { data: inserted, error: insertErr } = await (supabase as any)
        .from(this.tableName)
        .insert(basePayload)
        .select("id")
        .limit(1)

      if (insertErr) {
        console.error("[ProductMappingsTable] incrementCounts insert failed", insertErr)
        return null
      }
      mappingId = inserted?.[0]?.id
    }

    if (!mappingId) return null

    // 2) Increment via security-definer RPC to bypass RLS updates
    const { error: rpcErr } = await supabase.rpc("increment_mapping_counters", {
      target_id: mappingId,
      modal_inc: modal_delta,
      exchange_inc: exchange_delta,
    })

    if (rpcErr) {
      console.error("[ProductMappingsTable] incrementCounts rpc failed", rpcErr)
    }

    return mappingId
  }
}

export const productMappingsDB = new ProductMappingsTable()
