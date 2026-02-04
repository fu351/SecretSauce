"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useToast } from "../ui/use-toast"
import type { StoreComparison, GroceryItem, ShoppingListIngredient as ShoppingListItem } from "@/lib/types/store"
import { useAuth } from "@/contexts/auth-context"
import { profileDB } from "@/lib/database/profile-db"
import { shoppingItemPriceCacheDB, type PricingResult } from "@/lib/database/shopping-item-price-cache-db"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { ingredientsHistoryDB, normalizeStoreName } from "@/lib/database/ingredients-db"
import { normalizeZipCode } from "@/lib/utils/zip"
import { type StoreMetadataMap, type StoreMetadata } from "@/lib/utils/store-metadata"

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

export function useStoreComparison(
  shoppingList: ShoppingListItem[],
  zipCode: string,
  userLocation: { lat: number, lng: number } | null,
) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [profileZipCode, setProfileZipCode] = useState<string | null>(null)

  const [results, setResults] = useState<StoreComparison[]>([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [activeStoreIndex, setActiveStoreIndex] = useState(0)
  const [sortMode, setSortMode] = useState<"cheapest" | "best-value" | "nearest">("cheapest")
  const resolvedZipCode = normalizeZipCode(zipCode) || normalizeZipCode(profileZipCode) || undefined

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

  const buildComparisonsFromScrape = useCallback((searchData: Array<{ item: ShoppingListItem; storeResults: any[] }>, storeMetadata: StoreMetadataMap): StoreComparison[] => {
    const storeMap = new Map<string, StoreComparison>()

    searchData.forEach(({ item, storeResults }) => {
      const validResults = storeResults.filter(r => r.items && r.items.length > 0)

      validResults.forEach(storeResult => {
        const storeName = (storeResult.store || "").trim()
        if (!storeName) return

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

        const entry = storeMap.get(storeName)!
        const bestOption = storeResult.items.reduce((min: any, curr: any) =>
          curr.price < min.price ? curr : min
        )

        const qty = Math.max(1, Math.ceil(item.quantity || 1))
        const totalPrice = (bestOption.price || 0) * qty
        entry.items.push({
          ...bestOption,
          price: totalPrice, // store total cost for the purchased quantity
          shoppingItemId: item.id,
          originalName: item.name,
          quantity: qty
        })
        entry.total += totalPrice
      })
    })

    const comparisons = Array.from(storeMap.values()).map(comp => {
      const foundItemIds = new Set<string>()
      comp.items.forEach(i => {
        const itemIds = (i as any).shoppingItemIds || [i.shoppingItemId]
        itemIds.forEach((id: string) => foundItemIds.add(id))
      })
      const missingIngredients = shoppingList.filter(item => !foundItemIds.has(item.id))

      // Enrich with coordinates & distance from store metadata
      const normalizedStore = normalizeStoreName(comp.store)
      const metadata = storeMetadata.get(normalizedStore)
      const latitude = metadata?.latitude ?? undefined
      const longitude = metadata?.longitude ?? undefined
      const distanceMiles = metadata?.distanceMiles ?? comp.distanceMiles

      return {
        ...comp,
        missingCount: missingIngredients.length,
        missingItems: missingIngredients.length > 0,
        missingIngredients: missingIngredients,
        latitude,
        longitude,
        distanceMiles,
      }
    })

    if (comparisons.length > 0) {
      const maxTotal = Math.max(...comparisons.map(c => c.total))
      comparisons.forEach(c => {
        c.savings = maxTotal - c.total
      })
    }

    return comparisons
  }, [shoppingList])

  useEffect(() => {
    if (!user) {
      setProfileZipCode(null)
      return
    }

    let isActive = true
    void (async () => {
      try {
        const data = await profileDB.fetchProfileFields(user.id, ["zip_code"])
        if (isActive) {
          const normalized = normalizeZipCode(data?.zip_code)
          setProfileZipCode(normalized ?? null)
        }
      } catch (error) {
        console.error("[useStoreComparison] Failed to load profile zip:", error)
      }
    })()

    return () => {
      isActive = false
    }
  }, [user])

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
      // ----- Primary: server-side pricing function -----
      const pricingData = user ? await shoppingItemPriceCacheDB.getPricingForUser(user.id) : []
      let comparisons = buildComparisonsFromPricing(pricingData, storeMetadata)
      let finalComparisons = comparisons

      // ----- Scrape only missing items, insert into history, then re-run pricing -----
      const missingItems = shoppingList.filter(item => !comparisons.some(c =>
        c.items.some(i => (i as any).shoppingItemIds?.includes(item.id) || i.shoppingItemId === item.id)))
      if (missingItems.length > 0) {
        // Only scrape stores that we have metadata for (from getUserPreferredStores)
        const availableStores = Array.from(storeMetadata.entries())
          .filter(([_, meta]) => meta.zipCode) // Only stores with valid zipcodes
          .map(([storeName, _]) => storeName)

        const scrapeResults = await Promise.all(
          missingItems.map(async (item) => {
            // Scrape all available stores in parallel
            const storeResults = await Promise.all(
              availableStores.map(async (storeName) => {
                const metadata = storeMetadata.get(storeName)!
                // Use each store's specific zipcode from getUserPreferredStores
                return searchGroceryStores(
                  item.name,
                  metadata.zipCode!,
                  storeName,
                  undefined,
                  true
                )
              })
            )
            // Flatten the array of arrays
            const flattenedResults = storeResults.flat()
            return { item, storeResults: flattenedResults }
          })
        )

        let scrapeComparisons = buildComparisonsFromScrape(scrapeResults, storeMetadata)

        const skipLog: Array<{ item: string; store?: string; reason: string }> = []

        const historyPayload = scrapeResults.flatMap(({ item, storeResults }) => {
          const flattened = storeResults.flatMap(s => s.items.map(it => ({ ...it, store: s.store })))
          if (!flattened.length) return []

          return flattened.flatMap(best => {
            if (!item.ingredient_id) {
              skipLog.push({ item: item.name, store: best.store, reason: "missing ingredient_id" })
              return []
            }
            const unitPriceNumber =
              typeof best.pricePerUnit === "string"
                ? Number(String(best.pricePerUnit).replace(/[^0-9.]/g, "")) || null
                : null
            const normalizedStore = normalizeStoreName(best.store)
            const metadata = storeMetadata.get(normalizedStore)

            // Only insert if we have valid metadata with zipcode from getUserPreferredStores
            if (!metadata || !metadata.zipCode) {
              console.warn(`[useStoreComparison] Skipping item "${item.name}" for store "${best.store}" - no metadata with zipcode found`)
              skipLog.push({ item: item.name, store: best.store, reason: "no metadata zip" })
              return []
            }

            if (!(best.price > 0)) {
              skipLog.push({ item: item.name, store: best.store, reason: "non-positive price" })
              return []
            }

            const groceryStoreId = metadata.grocery_store_id ?? null
            const storeZipCode = metadata.zipCode  // Always use store's physical zipcode from RPC
            return [{
              standardizedIngredientId: item.ingredient_id,
              store: normalizedStore,
              price: best.price,
              quantity: 1,
              unit: best.unit || "unit",
              unitPrice: unitPriceNumber,
              imageUrl: best.image_url,
              productName: best.title,
              productId: best.id,
              location: best.location || null,
              zipCode: storeZipCode,
              groceryStoreId,
            }]
          })
        })

        if (skipLog.length > 0) {
          console.warn("[useStoreComparison] Skipped history inserts", skipLog)
        }

        if (historyPayload.length > 0) {
          let count = await ingredientsHistoryDB.batchInsertPricesRpc(historyPayload)
          if (count === 0) {
            count = await ingredientsHistoryDB.batchInsertPrices(historyPayload)
          }
          if (count === 0) {
            console.error("[useStoreComparison] Failed to insert history from scraper")
          }

          const refreshed = await shoppingItemPriceCacheDB.getPricingForUser(user?.id || "")
          const refreshedComparisons = buildComparisonsFromPricing(refreshed, storeMetadata)
          if (refreshedComparisons.length > 0) {
            finalComparisons = refreshedComparisons
          }
        }

        // If scraping yielded nothing usable, fall back to any partial comparisons we had
        if (finalComparisons === comparisons) {
          if (scrapeComparisons.length > 0) {
            finalComparisons = scrapeComparisons
          } else {
            toast({ title: "No prices found", description: "Try another zip or adjust items.", variant: "destructive" })
          }
        }
      }

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
  }, [shoppingList, resolvedZipCode, toast, user, buildComparisonsFromPricing, buildComparisonsFromScrape])

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
