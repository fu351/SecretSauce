import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedProfile } from "@/lib/foundation/server"
import type { PricingResult } from "@/lib/database/ingredients-db"
import type { GroceryItem, ShoppingListIngredient, StoreComparison } from "@/lib/types/store"

type ComparisonItem = GroceryItem & {
  shoppingItemId: string
  originalName: string
  shoppingItemIds?: string[]
}

const STORE_DISPLAY_NAMES: Record<string, string> = {
  aldi: "Aldi",
  kroger: "Kroger",
  safeway: "Safeway",
  meijer: "Meijer",
  target: "Target",
  traderjoes: "Trader Joe's",
  "99ranch": "99 Ranch",
  walmart: "Walmart",
  andronicos: "Andronico's Community Markets",
  wholefoods: "Whole Foods",
}

function getStoreDisplayName(storeKey: string, fallback?: string | null) {
  return STORE_DISPLAY_NAMES[storeKey] || fallback || storeKey || "Store"
}

function normalizeShoppingItemId(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim()
}

function parseMaybeJson(value: unknown): unknown {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== "string") break
    try {
      current = JSON.parse(current)
    } catch {
      break
    }
  }
  return current
}

function normalizePricingPayload(value: unknown): PricingResult[] {
  const parsed = parseMaybeJson(value)

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => normalizePricingPayload(item))
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>
    const wrapped =
      record.pricing_summary ??
      record.pricingSummary ??
      record.get_pricing ??
      record.result ??
      record.data

    if (wrapped !== undefined) return normalizePricingPayload(wrapped)
    return [record as unknown as PricingResult]
  }

  return []
}

function normalizeRequestItems(rawItems: ShoppingListIngredient[] | undefined): ShoppingListIngredient[] {
  return (rawItems ?? [])
    .map((item) => ({
      ...item,
      quantity: Number(item.quantity) || 1,
      unit: item.unit || "unit",
      category: item.category || "other",
    }))
    .filter((item) => item.id && item.name)
}

function buildComparisons(
  pricingData: PricingResult[],
  normalizedItems: ShoppingListIngredient[],
): StoreComparison[] {
  const storeMap = new Map<string, StoreComparison>()
  const itemsById = new Map(normalizedItems.map((item) => [normalizeShoppingItemId(item.id), item]))
  const itemsByIngredientId = new Map<string, ShoppingListIngredient[]>()

  normalizedItems.forEach((item) => {
    const ingredientId = normalizeShoppingItemId(item.ingredient_id ?? item.standardizedIngredientId)
    if (!ingredientId) return
    const existing = itemsByIngredientId.get(ingredientId) ?? []
    existing.push(item)
    itemsByIngredientId.set(ingredientId, existing)
  })

  pricingData.forEach((entry) => {
    const rpcItemIds = Array.isArray(entry.item_ids)
      ? entry.item_ids.map((itemId) => normalizeShoppingItemId(itemId)).filter(Boolean)
      : []
    const standardizedIngredientId = normalizeShoppingItemId(entry.standardized_ingredient_id)
    const ingredientMatchedItems = standardizedIngredientId
      ? (itemsByIngredientId.get(standardizedIngredientId) ?? [])
      : []
    const idMatchedItems = rpcItemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is ShoppingListIngredient => Boolean(item))
    const matchedItems = [...ingredientMatchedItems, ...idMatchedItems].filter(
      (item, idx, arr) => arr.findIndex((candidate) => candidate.id === item.id) === idx,
    )

    if (matchedItems.length === 0) return

    const shoppingItemIds = [...new Set(matchedItems.map((item) => normalizeShoppingItemId(item.id)))]
    const representativeItem = matchedItems[0]
    const offers = Array.isArray(entry.offers) ? entry.offers : []

    offers.forEach((offer) => {
      const storeKey = (offer.store || offer.store_name || "unknown").toString().trim().toLowerCase()
      const displayName = getStoreDisplayName(storeKey, offer.store_name)
      const totalPrice = Number(offer.total_price ?? offer.package_price ?? offer.unit_price ?? 0)
      const packagePrice = offer.package_price == null ? null : Number(offer.package_price)
      const itemQuantity = Number(entry.total_amount ?? representativeItem.quantity ?? 1) || 1

      if (!storeMap.has(storeKey)) {
        storeMap.set(storeKey, {
          store: displayName,
          items: [],
          total: 0,
          savings: 0,
          missingItems: false,
          missingCount: 0,
          missingIngredients: [],
          providerAliases: [storeKey],
          canonicalKey: storeKey,
        })
      }

      const comparison = storeMap.get(storeKey)!
      const item: ComparisonItem = {
        id: `${storeKey}-${shoppingItemIds[0] || standardizedIngredientId || comparison.items.length}`,
        title: offer.product_name || representativeItem.name,
        brand: representativeItem.category || "",
        price: Number(totalPrice.toFixed(2)),
        pricePerUnit: offer.unit_price ? `$${Number(offer.unit_price).toFixed(2)}/${entry.requested_unit || "unit"}` : undefined,
        unit: entry.requested_unit || undefined,
        image_url: offer.image_url || "",
        provider: displayName,
        location: offer.zip_code ? `${displayName} (${offer.zip_code})` : displayName,
        category: representativeItem.category || "other",
        quantity: itemQuantity,
        shoppingItemId: shoppingItemIds[0] || "",
        originalName: representativeItem.name,
        shoppingItemIds,
        productMappingId: offer.product_mapping_id || undefined,
        packagesToBuy: offer.packages_to_buy == null ? undefined : Number(offer.packages_to_buy),
        requestedUnit: entry.requested_unit ?? null,
        productUnit: offer.product_unit ?? null,
        productQuantity: offer.product_quantity == null ? null : Number(offer.product_quantity),
        convertedQuantity: offer.converted_quantity == null ? null : Number(offer.converted_quantity),
        packagePrice,
        conversionError: offer.conversion_error ?? null,
        usedEstimate: offer.used_estimate ?? null,
      }

      comparison.items.push(item)
      comparison.total = Number((comparison.total + item.price).toFixed(2))
      comparison.distanceMiles = offer.distance == null ? comparison.distanceMiles : Number(offer.distance)
    })
  })

  const stores = Array.from(storeMap.values()).map((store) => {
    const foundItemIds = new Set<string>()
    store.items.forEach((item) => {
      ;(item.shoppingItemIds ?? [item.shoppingItemId]).forEach((itemId) => foundItemIds.add(normalizeShoppingItemId(itemId)))
    })
    const missingIngredients = normalizedItems.filter((item) => !foundItemIds.has(normalizeShoppingItemId(item.id)))
    return {
      ...store,
      missingItems: missingIngredients.length > 0,
      missingCount: missingIngredients.length,
      missingIngredients,
    }
  })

  if (stores.length > 0) {
    const maxTotal = Math.max(...stores.map((store) => store.total))
    stores.forEach((store) => {
      store.savings = Number((maxTotal - store.total).toFixed(2))
    })
  }

  return stores
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      items?: ShoppingListIngredient[]
      zipCode?: string | null
    }
    const normalizedItems = normalizeRequestItems(payload?.items)

    if (normalizedItems.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const { data, error } = await (profile.supabase.rpc as any)("get_pricing", {
      p_user_id: profile.profileId,
    })

    if (error) {
      console.error("[price-comparison] get_pricing RPC failed", error)
      return NextResponse.json(
        { error: "Unable to load live prices" },
        { status: 500 },
      )
    }

    return NextResponse.json({
      results: buildComparisons(normalizePricingPayload(data), normalizedItems),
    })
  } catch (error) {
    console.error("[price-comparison] Unexpected error", error)
    return NextResponse.json(
      { error: "Could not compute store comparisons" },
      { status: 500 },
    )
  }
}
