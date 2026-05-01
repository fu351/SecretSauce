import type { StoreComparison } from "@/lib/types/store"

export type StoreComparisonExportItem = {
  id: string
  shopping_item_id: string
  shopping_item_ids: string[]
  original_name: string
  title: string
  product_mapping_id: string | null
  price: number
  quantity: number | null
  packages_to_buy: number | null
  requested_unit: string | null
  product_unit: string | null
  product_quantity: number | null
  converted_quantity: number | null
  conversion_error: boolean | null
  used_estimate: boolean | null
  price_source: string | null
  price_store_id: string | null
  used_price_backup: boolean | null
}

export type StoreComparisonExportStore = {
  store: string
  canonical_key: string | null
  grocery_store_id: string | null
  total: number
  savings: number
  distance_miles: number | null
  latitude: number | null
  longitude: number | null
  location_hint: string | null
  missing_count: number
  missing_items: boolean
  items: StoreComparisonExportItem[]
  missing_ingredients: Array<{
    id: string
    name: string
  }>
}

export type StoreComparisonExportPayload = {
  kind: "store-comparison-jsonb"
  exported_at: string
  selected_store: string | null
  selected_store_index: number | null
  store_count: number
  store_order: string[]
  store_mapping: Record<string, StoreComparisonExportStore>
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (value === null || value === undefined) return null
  return Boolean(value)
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildStoreComparisonExportPayload(
  comparisons: StoreComparison[],
  selectedStoreIndex: number | null = null
): StoreComparisonExportPayload {
  const storeOrder = comparisons.map((comparison) => comparison.store)
  const selectedStore = selectedStoreIndex !== null && selectedStoreIndex >= 0
    ? comparisons[selectedStoreIndex]?.store ?? null
    : null

  const storeMapping = comparisons.reduce<Record<string, StoreComparisonExportStore>>((acc, comparison) => {
    const storeKey = comparison.store

    acc[storeKey] = {
      store: storeKey,
      canonical_key: normalizeString(comparison.canonicalKey),
      grocery_store_id: normalizeString(comparison.groceryStoreId),
      total: Number(comparison.total) || 0,
      savings: Number(comparison.savings) || 0,
      distance_miles: normalizeNumber(comparison.distanceMiles),
      latitude: normalizeNumber(comparison.latitude),
      longitude: normalizeNumber(comparison.longitude),
      location_hint: normalizeString(comparison.locationHint),
      missing_count: Number(comparison.missingCount) || 0,
      missing_items: normalizeBoolean(comparison.missingItems) ?? (Number(comparison.missingCount) || 0) > 0,
      items: comparison.items.map((item) => ({
        id: item.id,
        shopping_item_id: item.shoppingItemId,
        shopping_item_ids: (item.shoppingItemIds ?? [item.shoppingItemId]).filter(Boolean),
        original_name: item.originalName,
        title: item.title,
        product_mapping_id: normalizeString(item.productMappingId),
        price: Number(item.price) || 0,
        quantity: normalizeNumber(item.quantity),
        packages_to_buy: normalizeNumber(item.packagesToBuy),
        requested_unit: normalizeString(item.requestedUnit),
        product_unit: normalizeString(item.productUnit),
        product_quantity: normalizeNumber(item.productQuantity),
        converted_quantity: normalizeNumber(item.convertedQuantity),
        conversion_error: normalizeBoolean(item.conversionError),
        used_estimate: normalizeBoolean(item.usedEstimate),
        price_source: normalizeString(item.priceSource),
        price_store_id: normalizeString(item.priceStoreId),
        used_price_backup: normalizeBoolean(item.usedPriceBackup),
      })),
      missing_ingredients: (comparison.missingIngredients ?? []).map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
      })),
    }

    return acc
  }, {})

  return {
    kind: "store-comparison-jsonb",
    exported_at: new Date().toISOString(),
    selected_store: selectedStore,
    selected_store_index: selectedStoreIndex,
    store_count: comparisons.length,
    store_order: storeOrder,
    store_mapping: storeMapping,
  }
}
