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
      metadataMap.set(normalizedName, {
        storeId: item.storeId,
        grocery_store_id: item.grocery_store_id,
        zipCode: item.zipCode,
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        distanceMiles: item.distanceMiles ?? item.distance_miles ?? null,
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
        undefined,
        true
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
    const itemsById = new Map(shoppingList.map(item => [item.id, item]))

    pricingData.forEach((entry: any) => {
      const itemIds: string[] = entry?.item_ids ?? []
      const offers: any[] = entry?.offers ?? []
      const representativeItem = itemsById.get(itemIds[0] || "")
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
        const totalQty = Math.max(1, Math.ceil(Number(entry?.total_quantity ?? 1)))
        const totalPrice = offer?.total_price != null ? Number(offer.total_price) : 0
        const distance = typeof offer?.distance === "number" ? offer.distance : undefined

        comp.items.push({
          id: `${storeKey}-${itemIds[0] || Math.random()}`,
          title: offer?.product_name || fallbackName,
          brand: "",
          price: totalPrice,
          pricePerUnit: undefined, // DB totals are already whole-item; no unit price displayed
          unit: undefined,
          image_url: offer?.image_url || undefined,
          provider: storeName,
          location: offer?.zip_code ? `${storeName} (${offer.zip_code})` : storeName,
          category: "other",
          quantity: totalQty,
          shoppingItemId: itemIds[0] || "",
          originalName: fallbackName,
          shoppingItemIds: itemIds,
          productMappingId: offer?.product_mapping_id || undefined,
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
        itemIds.forEach((id: string) => foundItemIds.add(id))
      })
      const missingIngredients = shoppingList.filter(item => !foundItemIds.has(item.id))

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
    return comps
  }, [shoppingList])

  // -- Actions --
  const performMassSearch = useCallback(async () => {
    if (!shoppingList || shoppingList.length === 0) {
      toast({ title: "Empty List", description: "Add items first.", variant: "destructive" })
      return
    }

    setLoading(true)
    setHasFetched(false)
    setActiveStoreIndex(0)

    try {
      // ----- Fetch user preferred stores metadata via API (uses RPC with fallback) -----
      const storeMetadata = await fetchUserStoreMetadata(user?.id, resolvedZipCode)
      // ----- Fill cache gaps before pricing -----
      if (user) {
        const pricingGaps = await ingredientsRecentDB.getPricingGaps(user.id)
        if (pricingGaps.length > 0) {
          console.warn("[useStoreComparison] Filling pricing gaps", { gaps: pricingGaps.length })
          console.log("[useStoreComparison] Pricing gaps payload", pricingGaps)
          toast({
            title: "Pricing gaps detected",
            description: `Found ${pricingGaps.length} gap(s) before comparison`,
            variant: "secondary",
          })
          const { inserted } = await hydratePricingGaps(pricingGaps, resolvedZipCode)
          if (inserted > 0) {
            toast({
              title: "Pricing gaps backfilled",
              description: `Inserted ${inserted} rows`,
              variant: "success",
            })
          } else {
            toast({
              title: "Pricing gaps still empty",
              description: "No rows inserted after scraping",
              variant: "destructive",
            })
          }
        }
      }
      // ----- Primary: server-side pricing function -----
      const pricingData = user ? await ingredientsRecentDB.getPricingForUser(user.id) : []
      let comparisons = buildComparisonsFromPricing(pricingData, storeMetadata)
      let finalComparisons = comparisons

      // Ensure every preferred store appears, even if no pricing/scrape data
      const normalizedExisting = new Set(
        finalComparisons.map((c) => normalizeStoreName(c.store))
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
      })

      setResults(finalComparisons)
      setActiveStoreIndex(0)
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
