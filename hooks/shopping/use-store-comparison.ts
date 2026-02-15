"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useToast } from "../ui/use-toast"
import type { StoreComparison, GroceryItem, ShoppingListIngredient as ShoppingListItem } from "@/lib/types/store"
import { useAuth } from "@/contexts/auth-context"
import { profileDB } from "@/lib/database/profile-db"
import { ingredientsHistoryDB, ingredientsRecentDB, normalizeStoreName, type PricingResult } from "@/lib/database/ingredients-db"
import { normalizeZipCode } from "@/lib/utils/zip"
import { type StoreMetadataMap, type StoreMetadata } from "@/lib/utils/store-metadata"
import { searchGroceryStores } from "@/lib/grocery-scrapers"

const ENABLE_DEV_PRICING_LOGS = process.env.NODE_ENV !== "production"

function devPricingLog(message: string, payload?: unknown) {
  if (!ENABLE_DEV_PRICING_LOGS) return
  if (payload === undefined) {
    console.log(`[useStoreComparison][dev] ${message}`)
    return
  }
  console.log(`[useStoreComparison][dev] ${message}`, payload)
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

async function fetchUserStoreMetadata(
  userId: string | undefined,
  fallbackZip: string | undefined
): Promise<StoreMetadataMap> {
  if (!userId) return new Map()

  try {
    const response = await fetch(
      `/api/user-store-metadata?userId=${userId}&zipCode=${fallbackZip || ""}`
    )

    if (!response.ok) {
      console.error("[useStoreComparison] Failed to fetch store metadata")
      return new Map()
    }

    const { metadata } = await response.json()

    // Deserialize array back to Map
    const metadataMap = new Map<string, StoreMetadata>()
    metadata.forEach((item: any) => {
      const normalizedName = normalizeStoreName(item.storeName)
      const latitude = parseNumber(item.latitude)
      const longitude = parseNumber(item.longitude)
      const distanceMiles = parseNumber(item.distanceMiles ?? item.distance_miles)
      metadataMap.set(normalizedName, {
        storeId: item.storeId,
        grocery_store_id: item.grocery_store_id,
        zipCode: item.zipCode,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        distanceMiles: distanceMiles ?? null,
      })
    })

    return metadataMap
  } catch (error) {
    console.error("[useStoreComparison] Error fetching store metadata:", error)
    return new Map()
  }
}

type PricingGap = {
  store: string
  grocery_store_id: string | null
  zip_code: string | null
  ingredients: {
    id: string
    name: string
  }[]
}

async function hydratePricingGaps(
  gaps: PricingGap[],
  fallbackZip?: string
): Promise<{ inserted: number }> {
  if (!gaps.length) return { inserted: 0 }

  const payloads: Array<{
    standardizedIngredientId: string
    store: string
    price: number
    imageUrl?: string | null
    productName?: string | null
    productId?: string | null
    zipCode?: string | null
    groceryStoreId?: string | null
  }> = []

  for (const gap of gaps) {
    const gapZip = gap.zip_code || fallbackZip
    for (const ingredient of gap.ingredients) {
      const storeResults = await searchGroceryStores(
        ingredient.name,
        gapZip || undefined,
        gap.store,
        true,
        ingredient.id
      )

      if (!storeResults?.length) continue

      const targetStore = storeResults.find(
        (result) => normalizeStoreName(result.store) === normalizeStoreName(gap.store)
      ) || storeResults[0]

      if (!targetStore?.items?.length) continue

      const best =
        targetStore.items.reduce((prev, curr) => (curr.price < (prev?.price ?? Number.POSITIVE_INFINITY) ? curr : prev), targetStore.items[0])

      if (!best) continue

      payloads.push({
        standardizedIngredientId: ingredient.id,
        store: targetStore.store,
        price: best.price ?? 0,
        imageUrl: best.image_url || null,
        productName: best.title || null,
        productId: best.id || null,
        zipCode: gapZip ?? null,
        groceryStoreId: gap.grocery_store_id ?? null,
      })
    }
  }

  if (!payloads.length) return { inserted: 0 }

  console.log("[useStoreComparison] Batch insert payload", { payloadCount: payloads.length })

  let count = await ingredientsHistoryDB.batchInsertPricesRpc(payloads)
  if (count === 0) {
    count = await ingredientsHistoryDB.batchInsertPrices(payloads)
  }

  if (count === 0) {
    console.warn("[useStoreComparison] Failed to backfill pricing gaps")
  } else {
    console.log("[useStoreComparison] Filled pricing gaps", { count, gaps: gaps.length })
  }

  console.log("[useStoreComparison] Batch insert RPC count", { count, inserted: count })

  return { inserted: count }
}

type PerformMassSearchOptions = {
  skipPricingGaps?: boolean
  showCachedFirst?: boolean
}

export function useStoreComparison(
  shoppingList: ShoppingListItem[],
  zipCode: string,
  userLocation: { lat: number, lng: number } | null,
) {
  const { toast } = useToast()
  const { user } = useAuth()

  const [results, setResults] = useState<StoreComparison[]>([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [activeStoreIndex, setActiveStoreIndex] = useState(0)
  const [sortMode, setSortMode] = useState<"cheapest" | "best-value" | "nearest">("cheapest")
  const resolvedZipCode = normalizeZipCode(zipCode) || undefined

  const buildComparisonsFromPricing = useCallback((pricingData: PricingResult[], storeMetadata: StoreMetadataMap): StoreComparison[] => {
    const storeMap = new Map<string, StoreComparison>()
    const itemsById = new Map(shoppingList.map(item => [normalizeShoppingItemId(item.id), item]))
    const itemsByIngredientId = new Map<string, ShoppingListItem[]>()
    const diagnostics: Array<{
      standardizedIngredientId: string
      rpcItemIds: string[]
      matchedShoppingItemIds: string[]
      resolvedShoppingItemIds: string[]
      offersCount: number
      offerStores: string[]
      rawEntryKeys: string[]
      rawOffersType: string
    }> = []
    let entriesWithNoOffers = 0
    let entriesWithNoResolvedIds = 0

    shoppingList.forEach((item) => {
      const ingredientId = normalizeShoppingItemId(item.ingredient_id ?? item.standardizedIngredientId)
      if (!ingredientId) return
      const existing = itemsByIngredientId.get(ingredientId) ?? []
      existing.push(item)
      itemsByIngredientId.set(ingredientId, existing)
    })

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
      diagnostics.push({
        standardizedIngredientId,
        rpcItemIds,
        matchedShoppingItemIds,
        resolvedShoppingItemIds: shoppingItemIds,
        offersCount: offers.length,
        offerStores: offers.map((offer: any) => String(offer?.store || offer?.store_name || "unknown")),
        rawEntryKeys: Object.keys(entry || {}),
        rawOffersType: typeof entry?.offers,
      })
      const fallbackName = representativeItem?.name || "Item"

      offers.forEach(offer => {
        const canonicalStore = (offer?.store || offer?.store_enum || offer?.store_name || "Unknown").toString().trim()
        const storeDisplayName = (offer?.store_name || canonicalStore || "Unknown").toString().trim()

        if (!storeMap.has(canonicalStore)) {
          storeMap.set(canonicalStore, {
            store: canonicalStore,
            items: [],
            total: 0,
            savings: 0,
            missingItems: false,
            missingCount: 0,
            missingIngredients: []
          })
        }

        const comp = storeMap.get(canonicalStore)!
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
          id: `${canonicalStore}-${stableItemKey}`,
          title: offer?.product_name || fallbackName,
          brand: "",
          price: totalPrice,
          pricePerUnit: undefined, // DB totals are already whole-item; no unit price displayed
          unit: undefined,
          image_url: offer?.image_url || offer?.imageUrl || undefined,
          provider: canonicalStore,
          location: offer?.zip_code ? `${storeDisplayName} (${offer.zip_code})` : storeDisplayName,
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

    let comps = Array.from(storeMap.values()).map(comp => {
      const foundItemIds = new Set<string>()
      comp.items.forEach(i => {
        const itemIds = (i as any).shoppingItemIds || [i.shoppingItemId]
        itemIds.forEach((id: string) => foundItemIds.add(normalizeShoppingItemId(id)))
      })
      const missingIngredients = shoppingList.filter(item => !foundItemIds.has(normalizeShoppingItemId(item.id)))

      // Get coordinates from store metadata (from getUserPreferredStores)
      const normalizedStore = normalizeStoreName(comp.store)
      const metadata = storeMetadata.get(normalizedStore)

      // The metadata from getUserPreferredStores already has latitude/longitude from the RPC
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

    if (comps.length > 0) {
      const maxTotal = Math.max(...comps.map(c => c.total))
      comps.forEach(c => {
        c.savings = maxTotal - c.total
      })
    }

    devPricingLog("buildComparisonsFromPricing summary", {
      shoppingListCount: shoppingList.length,
      pricingEntryCount: pricingData.length,
      storesBuiltFromOffers: storeMap.size,
      comparisonsCount: comps.length,
      entriesWithNoOffers,
      entriesWithNoResolvedIds,
    })
    devPricingLog("buildComparisonsFromPricing sample", diagnostics.slice(0, 12))

    return comps
  }, [shoppingList])

  // -- Actions --
  const performMassSearch = useCallback(async (options?: PerformMassSearchOptions) => {
    if (!shoppingList || shoppingList.length === 0) {
      toast({ title: "Empty List", description: "Add items first.", variant: "destructive" })
      return
    }

    setLoading(true)
    setHasFetched(false)
    setActiveStoreIndex(0)

    try {
      devPricingLog("performMassSearch start", {
        skipPricingGaps: Boolean(options?.skipPricingGaps),
        showCachedFirst: Boolean(options?.showCachedFirst),
        shoppingListCount: shoppingList.length,
        resolvedZipCode: resolvedZipCode || null,
        userId: user?.id ?? null,
      })

      // ----- Fetch user preferred stores metadata via API (uses RPC with fallback) -----
      const storeMetadata = await fetchUserStoreMetadata(user?.id, resolvedZipCode)
      devPricingLog("store metadata", {
        count: storeMetadata.size,
        stores: Array.from(storeMetadata.keys()),
      })

      const logPricingData = (phase: "initial" | "final", pricingData: PricingResult[]) => {
        devPricingLog(`getPricingForUser ${phase} result`, {
          entries: pricingData.length,
          sample: pricingData.slice(0, 3).map((entry) => ({
            keys: Object.keys((entry as Record<string, unknown>) || {}),
            standardized_ingredient_id: entry.standardized_ingredient_id,
            item_ids: entry.item_ids,
            offersType: typeof (entry as Record<string, unknown>).offers,
            offers: Array.isArray(entry.offers) ? entry.offers.length : 0,
            stores: Array.isArray(entry.offers) ? entry.offers.map((offer) => offer.store || offer.store_name || "unknown") : [],
          })),
        })
      }

      const buildFinalComparisons = (pricingData: PricingResult[], phase: "initial" | "final"): StoreComparison[] => {
        let finalComparisons = buildComparisonsFromPricing(pricingData, storeMetadata)
        const shouldIncludePlaceholderStores = finalComparisons.length > 0 || !options?.skipPricingGaps
        let placeholderStoresAdded = 0

        if (shouldIncludePlaceholderStores) {
          // Ensure every preferred store appears, even if no pricing/scrape data
          const normalizedExisting = new Set(
            finalComparisons.map((comparison) => normalizeStoreName(comparison.store))
          )

          storeMetadata.forEach((meta, storeKey) => {
            if (normalizedExisting.has(storeKey)) return
            // Only include stores we can place on the map (have zip or coords)
            if (!meta.zipCode && !meta.latitude && !meta.longitude) return

            finalComparisons.push({
              store: storeKey,
              items: [],
              total: 0,
              savings: 0,
              missingItems: true,
              missingCount: shoppingList.length,
              missingIngredients: shoppingList,
              latitude: meta.latitude ?? undefined,
              longitude: meta.longitude ?? undefined,
              distanceMiles: meta.distanceMiles ?? undefined,
              groceryStoreId: meta.grocery_store_id ?? null,
              locationHint: meta.zipCode ? `${storeKey} (${meta.zipCode})` : undefined,
            })
            placeholderStoresAdded += 1
          })
        }

        devPricingLog(`comparison set ${phase}`, {
          totalStores: finalComparisons.length,
          storesWithItems: finalComparisons.filter((store) => store.items.length > 0).length,
          placeholderStoresAdded,
          stores: finalComparisons.map((store) => ({
            store: store.store,
            itemCount: store.items.length,
            missingCount: store.missingCount ?? 0,
            total: store.total,
          })),
        })

        return finalComparisons
      }

      let cachedPricingData: PricingResult[] = []
      let renderedCachedPricing = false

      if (options?.showCachedFirst) {
        cachedPricingData = user ? await ingredientsRecentDB.getPricingForUser(user.id) : []
        logPricingData("initial", cachedPricingData)
        const initialComparisons = buildFinalComparisons(cachedPricingData, "initial")
        setResults(initialComparisons)
        setActiveStoreIndex(0)
        setHasFetched(true)
        renderedCachedPricing = true

        if (options?.skipPricingGaps && cachedPricingData.length === 0) {
          toast({
            title: "No cached pricing in dev mode",
            description: "Dev Compare skips gap fill. Use Compare Prices to backfill missing cache rows.",
          })
        }
      }

      let insertedFromGapHydration = 0
      // ----- Fill cache gaps -----
      if (user && !options?.skipPricingGaps) {
        const pricingGaps = await ingredientsRecentDB.getPricingGaps(user.id)
        if (pricingGaps.length > 0) {
          console.warn("[useStoreComparison] Filling pricing gaps", { gaps: pricingGaps.length })
          console.log("[useStoreComparison] Pricing gaps payload", pricingGaps)
          const { inserted } = await hydratePricingGaps(pricingGaps, resolvedZipCode)
          insertedFromGapHydration = inserted
          devPricingLog("hydratePricingGaps completed", {
            gaps: pricingGaps.length,
            inserted,
          })
        }
      }

      const shouldRefreshPricing =
        !options?.showCachedFirst ||
        insertedFromGapHydration > 0 ||
        !renderedCachedPricing

      if (shouldRefreshPricing) {
        const pricingData = user ? await ingredientsRecentDB.getPricingForUser(user.id) : []
        logPricingData("final", pricingData)

        if (options?.skipPricingGaps && pricingData.length === 0 && !renderedCachedPricing) {
          toast({
            title: "No cached pricing in dev mode",
            description: "Dev Compare skips gap fill. Use Compare Prices to backfill missing cache rows.",
          })
        }

        const finalComparisons = buildFinalComparisons(pricingData, "final")
        setResults(finalComparisons)
        setActiveStoreIndex(0)
      }

      setHasFetched(true)
    } catch (error) {
      console.error("Mass search error:", error)
      toast({ title: "Search failed", variant: "destructive" })
      setHasFetched(true)
    } finally {
      setLoading(false)
    }
  }, [shoppingList, resolvedZipCode, toast, user, buildComparisonsFromPricing])

  // -- FIX: IMMUTABLE STATE PATCHER --
  // This ensures price changes trigger a re-render by creating new object references
  const replaceItemForStore = useCallback((
    storeName: string,
    shoppingItemId: string,
    newItem: GroceryItem
  ) => {
    setResults(prevResults => {
      return prevResults.map(store => {
        if (store.store !== storeName) return store

        let itemUpdated = false
        let newTotal = store.total
        
        // 1. Update Existing Found Item
        const updatedItems = store.items.map(item => {
          // Check if this item contains the shopping item ID (handles both single and merged items)
          const itemIds = (item as any).shoppingItemIds || [item.shoppingItemId]
          if (itemIds.includes(shoppingItemId)) {
            itemUpdated = true
            const qty = item.quantity || 1
            // Subtract old total for this item and add new total based on quantity
            newTotal = store.total - (item.price * qty) + (newItem.price * qty)

            return {
              ...item,
              title: newItem.title,
              image_url: newItem.image_url || item.image_url,
              price: newItem.price,
              productMappingId: newItem.productMappingId,
              originalName: item.originalName
            }
          }
          return item
        })

        // 2. Or: Move Missing Item -> Found Item
        let updatedMissing = store.missingIngredients
        
        if (!itemUpdated && store.missingIngredients) {
          const missingItemRef = store.missingIngredients.find(i => i.id === shoppingItemId)
          
          if (missingItemRef) {
            updatedMissing = store.missingIngredients.filter(i => i.id !== shoppingItemId)
            const qty = missingItemRef.quantity || 1
            
            updatedItems.push({
              ...newItem,
              id: `manual-${Date.now()}`,
              shoppingItemId: shoppingItemId,
              originalName: missingItemRef.name,
              quantity: qty
            })
            
            newTotal += (newItem.price * qty)
          }
        }

        // Return a NEW store object to trigger React update
        return {
          ...store,
          items: updatedItems,
          total: newTotal,
          missingIngredients: updatedMissing,
          missingCount: updatedMissing ? updatedMissing.length : 0
        }
      })
    })
  }, [])

  // Clear comparison state when upstream data changes
  const resetComparison = useCallback(() => {
    setResults([])
    setHasFetched(false)
    setActiveStoreIndex(0)
    setLoading(false)
    setSortMode("cheapest")
  }, [])

  const sortedResults = useMemo(() => {
    const sorted = [...results]
    sorted.sort((a, b) => {
      const aHasItems = a.items.length > 0 ? 0 : 1
      const bHasItems = b.items.length > 0 ? 0 : 1
      if (aHasItems !== bHasItems) return aHasItems - bHasItems

      const aMissing = a.missingCount || 0
      const bMissing = b.missingCount || 0
      if (aMissing !== bMissing) return aMissing - bMissing

      if (sortMode === "cheapest") {
        return a.total - b.total
      }

      if (sortMode === "best-value") {
        const aQty = a.items.reduce((sum, i) => sum + (i.quantity || 0), 0) || 1
        const bQty = b.items.reduce((sum, i) => sum + (i.quantity || 0), 0) || 1
        const aAvg = a.total / aQty
        const bAvg = b.total / bQty
        if (aAvg !== bAvg) return aAvg - bAvg
        return a.total - b.total
      }

      // nearest
      const aDist = a.distanceMiles ?? Number.POSITIVE_INFINITY
      const bDist = b.distanceMiles ?? Number.POSITIVE_INFINITY
      if (aDist !== bDist) return aDist - bDist
      return a.total - b.total
    })
    return sorted
  }, [results, sortMode])

  // Reset to first store whenever sort mode changes
  useEffect(() => {
    if (sortedResults.length > 0) {
      setActiveStoreIndex(0)
    }
  }, [sortMode, sortedResults.length])

  // Clamp active index when result set changes
  useEffect(() => {
    if (sortedResults.length === 0) {
      if (activeStoreIndex !== 0) setActiveStoreIndex(0)
      return
    }
    if (activeStoreIndex > sortedResults.length - 1) {
      setActiveStoreIndex(sortedResults.length - 1)
    }
  }, [sortedResults.length, activeStoreIndex])

  // -- Updated Navigation --
  const scrollToStore = useCallback((index: number) => {
    if (sortedResults.length === 0) return
    const safeIndex = Math.max(0, Math.min(index, sortedResults.length - 1))
    setActiveStoreIndex(safeIndex)
  }, [sortedResults.length])

  const nextStore = () => scrollToStore(activeStoreIndex + 1)
  const prevStore = () => scrollToStore(activeStoreIndex - 1)

  return {
    results: sortedResults,
    loading,
    hasFetched,
    performMassSearch,
    setResults,
    activeStoreIndex,
    scrollToStore,
    nextStore,
    prevStore,
    sortMode,
    setSortMode,
    replaceItemForStore,
    resetComparison
  }
}
