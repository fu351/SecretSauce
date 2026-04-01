import { supabase, type Database } from "@/lib/database/supabase"

const GROCERY_STORE_ENUMS = new Set<Database["public"]["Enums"]["grocery_store"]>([
  "aldi",
  "kroger",
  "safeway",
  "meijer",
  "target",
  "traderjoes",
  "99ranch",
  "walmart",
  "andronicos",
  "wholefoods",
])

function normalizeStoreName(store: string): string {
  return store.toLowerCase().replace(/\s+/g, "").replace(/[']/g, "").trim()
}

function resolveStoreBrand(
  value: string | Database["public"]["Enums"]["grocery_store"] | null | undefined
): Database["public"]["Enums"]["grocery_store"] | null {
  if (!value) return null
  const normalized = normalizeStoreName(value)
  if (GROCERY_STORE_ENUMS.has(normalized as Database["public"]["Enums"]["grocery_store"])) {
    return normalized as Database["public"]["Enums"]["grocery_store"]
  }
  if (normalized.includes("target")) return "target"
  if (normalized.includes("kroger") || normalized.includes("foodsco")) return "kroger"
  if (normalized.includes("meijer")) return "meijer"
  if (normalized.includes("99") || normalized.includes("ranch")) return "99ranch"
  if (normalized.includes("walmart")) return "walmart"
  if (normalized.includes("trader")) return "traderjoes"
  if (normalized.includes("aldi")) return "aldi"
  if (normalized.includes("andronico")) return "andronicos"
  if (normalized.includes("safeway")) return "safeway"
  if (normalized.includes("whole")) return "wholefoods"
  return null
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

  /**
   * Look up product mappings by raw product name (case-insensitive substring match).
   * Optionally filter by store brand. Returns rows that have already been resolved
   * (standardized_ingredient_id IS NOT NULL) ordered by ingredient_confidence descending.
   *
   * Used by the receipt processing pipeline to avoid re-queueing already-known products.
   */
  async lookupByRawName(
    rawName: string,
    storeBrand?: Database["public"]["Enums"]["grocery_store"] | null
  ): Promise<
    {
      id: string
      raw_product_name: string | null
      standardized_ingredient_id: string | null
      ingredient_confidence: number | null
      is_ingredient: boolean | null
      store_brand: Database["public"]["Enums"]["grocery_store"] | null
    }[]
  > {
    if (!rawName.trim()) return []

    let query = (supabase as any)
      .from(this.tableName)
      .select("id, raw_product_name, standardized_ingredient_id, ingredient_confidence, is_ingredient, store_brand")
      .ilike("raw_product_name", `%${rawName.trim()}%`)
      .not("standardized_ingredient_id", "is", null)
      .order("ingredient_confidence", { ascending: false })
      .limit(5)

    if (storeBrand) {
      query = query.eq("store_brand", storeBrand)
    }

    const { data, error } = await query

    if (error) {
      console.warn("[ProductMappingsTable] lookupByRawName error", error.code, error.message)
      return []
    }

    return data || []
  }

  /**
   * Fuzzy lookup: find the most similar product mapping by name using
   * PostgreSQL pg_trgm similarity. Falls back gracefully if pg_trgm is not
   * installed (returns empty array).
   *
   * Used by the receipt pipeline as a second-chance lookup when exact
   * substring matching (lookupByRawName) returns no results — handles OCR
   * typos and name variations (e.g. "GV OATMEAL" matching "GV OATMEAL QKR").
   */
  async fuzzyLookupByName(
    rawName: string,
    storeBrand?: Database["public"]["Enums"]["grocery_store"] | null,
    minSimilarity: number = 0.3
  ): Promise<
    {
      id: string
      raw_product_name: string | null
      standardized_ingredient_id: string | null
      ingredient_confidence: number | null
      is_ingredient: boolean | null
      store_brand: Database["public"]["Enums"]["grocery_store"] | null
      similarity: number
    }[]
  > {
    if (!rawName.trim()) return []

    const cleaned = rawName.trim().toLowerCase()

    // Use pg_trgm similarity() via RPC or raw SQL.
    // Supabase JS client doesn't natively support similarity(), so we use
    // an RPC wrapper. If the RPC doesn't exist, fall back to ilike prefix match.
    try {
      const params: Record<string, unknown> = {
        search_name: cleaned,
        min_similarity: minSimilarity,
        result_limit: 5,
      }
      if (storeBrand) {
        params.filter_store = storeBrand
      }

      const { data, error } = await supabase.rpc(
        "fuzzy_match_product_name" as any,
        params as any
      )

      if (error) {
        // RPC doesn't exist or pg_trgm not installed — fall back to prefix match
        if (error.code === "42883" || error.code === "PGRST202") {
          return this._prefixFallbackLookup(rawName, storeBrand)
        }
        console.warn("[ProductMappingsTable] fuzzyLookupByName rpc error", error.code, error.message)
        return this._prefixFallbackLookup(rawName, storeBrand)
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        raw_product_name: row.raw_product_name,
        standardized_ingredient_id: row.standardized_ingredient_id,
        ingredient_confidence: row.ingredient_confidence,
        is_ingredient: row.is_ingredient,
        store_brand: row.store_brand,
        similarity: row.similarity ?? 0,
      }))
    } catch {
      return this._prefixFallbackLookup(rawName, storeBrand)
    }
  }

  /**
   * Fallback when pg_trgm/RPC is unavailable: match on the first significant
   * word of the product name (≥3 chars) as a prefix search.
   */
  private async _prefixFallbackLookup(
    rawName: string,
    storeBrand?: Database["public"]["Enums"]["grocery_store"] | null
  ): Promise<
    {
      id: string
      raw_product_name: string | null
      standardized_ingredient_id: string | null
      ingredient_confidence: number | null
      is_ingredient: boolean | null
      store_brand: Database["public"]["Enums"]["grocery_store"] | null
      similarity: number
    }[]
  > {
    // Extract the first word ≥3 chars as the search key
    const words = rawName.trim().split(/\s+/).filter((w) => w.length >= 3)
    if (!words.length) return []
    const searchKey = words[0]

    let query = (supabase as any)
      .from(this.tableName)
      .select("id, raw_product_name, standardized_ingredient_id, ingredient_confidence, is_ingredient, store_brand")
      .ilike("raw_product_name", `%${searchKey}%`)
      .not("standardized_ingredient_id", "is", null)
      .order("ingredient_confidence", { ascending: false })
      .limit(5)

    if (storeBrand) {
      query = query.eq("store_brand", storeBrand)
    }

    const { data, error } = await query
    if (error || !data?.length) return []

    // Score results using simple word overlap
    const inputWords = new Set(rawName.toLowerCase().split(/\s+/))
    return data.map((row: any) => {
      const rowWords = new Set((row.raw_product_name || "").toLowerCase().split(/\s+/))
      const intersection = [...inputWords].filter((w) => rowWords.has(w)).length
      const union = new Set([...inputWords, ...rowWords]).size
      const sim = union > 0 ? intersection / union : 0
      return { ...row, similarity: sim }
    }).filter((r: any) => r.similarity >= 0.25)
      .sort((a: any, b: any) => b.similarity - a.similarity)
  }

  /**
   * Insert a single product mapping and return its id.
   * Used by the receipt pipeline to register new unseen products before queueing them.
   */
  async insertMapping(
    mapping: ProductMappingInsert
  ): Promise<string | null> {
    const { data, error } = await (supabase as any)
      .from(this.tableName)
      .insert(mapping)
      .select("id")
      .limit(1)

    if (error) {
      console.warn("[ProductMappingsTable] insertMapping error", error.code, error.message)
      return null
    }

    return (data?.[0] as { id: string } | undefined)?.id ?? null
  }
}

export const productMappingsDB = new ProductMappingsTable()
