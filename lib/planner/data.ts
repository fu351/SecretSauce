import { createServerClient } from "@/lib/database/supabase"
import {
  resolveOrCreateStandardizedId,
  getOrRefreshIngredientPrice,
} from "@/lib/ingredient-pipeline"
import type {
  RecipeIngredient,
  Store,
  StoreItem,
} from "./types"

const FALLBACK_STORES: Store[] = [
  { id: "walmart", name: "Walmart" },
  { id: "target", name: "Target" },
  { id: "kroger", name: "Kroger" },
  { id: "aldi", name: "Aldi" },
  { id: "safeway", name: "Safeway" },
  { id: "traderjoes", name: "Trader Joe's" },
  { id: "meijer", name: "Meijer" },
  { id: "wholefoods", name: "Whole Foods" },
]

export async function listCandidateStores(userId?: string): Promise<Store[]> {
  const client = createServerClient()
  try {
    const { data } = await client
      .from("store_locations_cache" as any)
      .select("store_canonical, postal_code")
      .limit(25)

    if (!data || data.length === 0) {
      return FALLBACK_STORES
    }

    const seen = new Set<string>()
    const stores: Store[] = []
    for (const row of data as Array<any>) {
      const id = (row.store_canonical || "").toLowerCase()
      if (!id || seen.has(id)) continue
      seen.add(id)
      stores.push({
        id,
        name: id.replace(/_/g, " "),
        zipCode: row.postal_code || null,
      })
    }
    return stores.length > 0 ? stores : FALLBACK_STORES
  } catch (error) {
    console.error("[planner] Failed to list candidate stores", error)
    return FALLBACK_STORES
  }
}

export async function getCheapestStoreItem(
  storeId: string,
  ingredient: { name: string; standardizedIngredientId?: string | null },
  options: { allowRealTimeScraping?: boolean } = {}
): Promise<StoreItem | null> {
  const client = createServerClient()
  const { allowRealTimeScraping = false } = options // Default to cache-only for speed

  try {
    const standardizedId =
      ingredient.standardizedIngredientId ||
      (await resolveOrCreateStandardizedId(ingredient.name))

    const cacheRow = await getOrRefreshIngredientPrice(standardizedId, storeId, {
      allowRealTimeScraping,
    })

    if (!cacheRow) return null

    return {
      storeId: cacheRow.store,
      standardizedIngredientId: standardizedId,
      name: cacheRow.product_name || ingredient.name,
      price: Number(cacheRow.price) || 0,
      quantity: Number(cacheRow.quantity) || 1,
      unit: cacheRow.unit || "unit",
      productId: cacheRow.product_id,
      productName: cacheRow.product_name,
    }
  } catch (error) {
    console.error("[planner] Failed to price ingredient", { ingredient: ingredient.name, storeId, error })
    return null
  }
}
