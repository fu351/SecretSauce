import type { ShoppingListIngredient as ShoppingListItem, StoreComparison } from "@/lib/types/store"
import type { PricingResult } from "@/lib/database/ingredients-db"
import type { StoreMetadataMap } from "@/lib/utils/store-metadata"
import { normalizeStoreName } from "@/lib/database/ingredients-db"

const ENABLE_DEV_PRICING_LOGS = process.env.NODE_ENV !== "production"

function devPricingLog(message: string, payload?: unknown) {
  if (!ENABLE_DEV_PRICING_LOGS) return
  if (payload === undefined) {
    console.log(`[buildPricingComparisons][dev] ${message}`)
    return
  }
  console.log(`[buildPricingComparisons][dev] ${message}`, payload)
}

function normalizeShoppingItemId(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function normalizeUnitValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function canonicalizeUnit(value: string | null): string | null {
  if (!value) return null
  if (["each", "ea", "unit", "units", "piece", "pieces", "item", "items"].includes(value)) {
    return "unit"
  }
  return value
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parsePositiveNumber(value: unknown): number | undefined {
  const parsed = parseNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  return undefined
}

function parseJsonArray<T = unknown>(value: unknown): T[] | null {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : null
  } catch {
    return null
  }
}

/**
 * Builds store comparisons from pricing data
 * Converts PricingResult[] from get_pricing RPC into StoreComparison[] for UI display
 *
 * @param pricingData - Raw pricing results from get_pricing RPC
 * @param storeMetadata - Store metadata with coordinates and distance
 * @param shoppingList - Current shopping list items
 * @returns Array of store comparisons sorted by total price
 */
export function buildComparisonsFromPricing(
  pricingData: PricingResult[],
  storeMetadata: StoreMetadataMap,
  shoppingList: ShoppingListItem[]
): StoreComparison[] {
  const storeMap = new Map<string, StoreComparison>()
  const itemsById = new Map(shoppingList.map(item => [normalizeShoppingItemId(item.id), item]))
  const itemsByIngredientId = new Map<string, ShoppingListItem[]>()
  let entriesWithNoOffers = 0
  let entriesWithNoResolvedIds = 0

  // Build index of items by ingredient ID
  shoppingList.forEach((item) => {
    const ingredientId = normalizeShoppingItemId(item.ingredient_id ?? item.standardizedIngredientId)
    if (!ingredientId) return
    const existing = itemsByIngredientId.get(ingredientId) ?? []
    existing.push(item)
    itemsByIngredientId.set(ingredientId, existing)
  })

  // Process each pricing entry
  pricingData.forEach((entry: any) => {
    const rawItemIds =
      parseJsonArray(entry?.item_ids) ??
      parseJsonArray(entry?.itemIds) ??
      []
    const rpcItemIds: string[] = rawItemIds
      .map((itemId: unknown) => normalizeShoppingItemId(itemId))
      .filter((itemId: string) => itemId.length > 0)
    const standardizedIngredientId = normalizeShoppingItemId(entry?.standardized_ingredient_id)
    const ingredientMatchedItems = standardizedIngredientId
      ? (itemsByIngredientId.get(standardizedIngredientId) ?? [])
      : []
    const idMatchedItems = rpcItemIds
      .map((itemId: string) => itemsById.get(itemId))
      .filter((item: ShoppingListItem | undefined): item is ShoppingListItem => Boolean(item))
    const matchedItems = [...ingredientMatchedItems, ...idMatchedItems].filter(
      (item, idx, arr) => arr.findIndex((candidate) => candidate.id === item.id) === idx
    )
    const matchedShoppingItemIds = matchedItems
      .map((item) => normalizeShoppingItemId(item.id))
      .filter((itemId): itemId is string => itemId.length > 0)
    const shoppingItemIds = [...new Set([...matchedShoppingItemIds, ...rpcItemIds])]
    const representativeItem = matchedItems[0] ?? itemsById.get(rpcItemIds[0] || "")
    const offers: any[] =
      parseJsonArray(entry?.offers) ??
      parseJsonArray(entry?.store_offers) ??
      parseJsonArray(entry?.pricing_offers) ??
      []
    if (offers.length === 0) entriesWithNoOffers += 1
    if (shoppingItemIds.length === 0) entriesWithNoResolvedIds += 1
    const fallbackName = representativeItem?.name || "Item"

    offers.forEach(offer => {
      const storeKey = (offer?.store || offer?.store_name || "Unknown").toString().trim()
      const storeName = (offer?.store_name || storeKey || "Unknown").toString().trim()

      if (!storeMap.has(storeName)) {
        storeMap.set(storeName, {
          store: storeName,
          items: [],
          total: 0,
          savings: 0,
          missingItems: false,
          missingCount: 0,
          missingIngredients: []
        })
      }

      const comp = storeMap.get(storeName)!
      const requestedAmountRaw = Number(entry?.total_amount ?? entry?.total_quantity ?? 1)
      const requestedAmount = requestedAmountRaw > 0 ? requestedAmountRaw : 1
      const totalQty = Math.max(1, Math.ceil(requestedAmount))
      const requestedUnit = entry?.requested_unit ?? null
      const totalPrice = parseNumber(offer?.total_price) ?? 0
      const distance = parseNumber(offer?.distance)
      const productUnit = offer?.product_unit ?? null
      const conversionError = parseBoolean(offer?.conversion_error) ?? false
      const usedEstimate = parseBoolean(offer?.used_estimate) ?? false
      const requestedUnitNormalized = canonicalizeUnit(normalizeUnitValue(requestedUnit))
      const productUnitNormalized = canonicalizeUnit(normalizeUnitValue(productUnit))
      const packagesFromOffer = parsePositiveNumber(offer?.packages_to_buy)
      const packagesToBuy =
        packagesFromOffer ??
        (!conversionError && requestedUnitNormalized && productUnitNormalized && requestedUnitNormalized === productUnitNormalized
          ? totalQty
          : undefined)
      const productQuantity = parseNumber(offer?.product_quantity)
      const convertedQuantity = parseNumber(offer?.converted_quantity)
      const packagePrice = parseNumber(offer?.package_price)
      const primaryShoppingItemId = shoppingItemIds[0] || ""
      const stableItemKey = primaryShoppingItemId || standardizedIngredientId || rpcItemIds[0] || String(comp.items.length)

      comp.items.push({
        id: `${storeKey}-${stableItemKey}`,
        title: offer?.product_name || fallbackName,
        brand: "",
        price: totalPrice,
        pricePerUnit: undefined,
        unit: undefined,
        image_url: offer?.image_url || offer?.imageUrl || undefined,
        provider: storeName,
        location: offer?.zip_code ? `${storeName} (${offer.zip_code})` : storeName,
        category: "other",
        quantity: requestedAmount,
        shoppingItemId: primaryShoppingItemId,
        originalName: fallbackName,
        shoppingItemIds,
        productMappingId: offer?.product_mapping_id || undefined,
        packagesToBuy,
        requestedUnit,
        productUnit,
        productQuantity,
        convertedQuantity,
        packagePrice,
        conversionError,
        usedEstimate,
      })

      comp.total += totalPrice
      if (distance !== undefined) {
        comp.distanceMiles = distance
      }
    })
  })

  // Add missing items and metadata
  let comps = Array.from(storeMap.values()).map(comp => {
    const foundItemIds = new Set<string>()
    comp.items.forEach(i => {
      const itemIds = (i as any).shoppingItemIds || [i.shoppingItemId]
      itemIds.forEach((id: string) => foundItemIds.add(normalizeShoppingItemId(id)))
    })
    const missingIngredients = shoppingList.filter(item => !foundItemIds.has(normalizeShoppingItemId(item.id)))

    // Get coordinates from store metadata
    const normalizedStore = normalizeStoreName(comp.store)
    const metadata = storeMetadata.get(normalizedStore)

    const latitude = metadata?.latitude ?? undefined
    const longitude = metadata?.longitude ?? undefined
    const distanceMiles = metadata?.distanceMiles ?? comp.distanceMiles

    return {
      ...comp,
      missingCount: missingIngredients.length,
      missingItems: missingIngredients.length > 0,
      missingIngredients,
      latitude,
      longitude,
      distanceMiles,
      groceryStoreId: metadata?.grocery_store_id ?? null,
    }
  })

  // Calculate savings
  if (comps.length > 0) {
    const maxTotal = Math.max(...comps.map(c => c.total))
    comps.forEach(c => {
      c.savings = maxTotal - c.total
    })
  }

  // Sort by total price (cheapest first)
  comps.sort((a, b) => {
    // Stores with items first
    const aHasItems = a.items.length > 0 ? 0 : 1
    const bHasItems = b.items.length > 0 ? 0 : 1
    if (aHasItems !== bHasItems) return aHasItems - bHasItems

    // Fewer missing items first
    const aMissing = a.missingCount || 0
    const bMissing = b.missingCount || 0
    if (aMissing !== bMissing) return aMissing - bMissing

    // Lowest total price
    return a.total - b.total
  })

  devPricingLog("buildComparisonsFromPricing summary", {
    shoppingListCount: shoppingList.length,
    pricingEntryCount: pricingData.length,
    storesBuiltFromOffers: storeMap.size,
    comparisonsCount: comps.length,
    entriesWithNoOffers,
    entriesWithNoResolvedIds,
  })

  return comps
}
