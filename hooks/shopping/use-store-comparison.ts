"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useToast } from "../ui/use-toast"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import type { StoreComparison, GroceryItem, ShoppingListIngredient as ShoppingListItem } from "@/lib/types/store"
import { useAuth } from "@/contexts/auth-context"
import { profileDB } from "@/lib/database/profile-db"

const SEARCH_CACHE_KEY = "store_search_cache"
const SEARCH_CACHE_TTL = 1000 * 60 * 30 // 30 minutes
const SEARCH_BATCH_SIZE = 5

type StoreSearchResults = Awaited<ReturnType<typeof searchGroceryStores>>

interface SearchCacheData {
  results: StoreComparison[]
  timestamp: number
  itemsHash: string
  zipCode: string
}

// Generate a hash of shopping list items to detect changes
function generateItemsHash(items: ShoppingListItem[]): string {
  return items
    .map(item => `${item.id}-${item.name}-${item.quantity}`)
    .sort()
    .join("|")
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
  const [activeStoreIndex, setActiveStoreIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [sortMode, setSortMode] = useState<"best-price" | "nearest" | "best-value">("best-price")
  const [usingCache, setUsingCache] = useState(false)
  const resolvedZipCode = zipCode || profileZipCode || ""

  useEffect(() => {
    if (!user) {
      setProfileZipCode(null)
      return
    }

    let isActive = true
    void (async () => {
      try {
        const data = await profileDB.fetchProfileFields(user.id, ["postal_code"])
        if (isActive) {
          setProfileZipCode(data?.postal_code ?? null)
        }
      } catch (error) {
        console.error("[useStoreComparison] Failed to load profile zip:", error)
      }
    })()

    return () => {
      isActive = false
    }
  }, [user])

  // Load cached search results on mount
  useEffect(() => {
    if (typeof window === "undefined" || !shoppingList.length) return
    if (!resolvedZipCode) return

    try {
      const cached = localStorage.getItem(SEARCH_CACHE_KEY)
      if (cached) {
        const parsedCache: SearchCacheData = JSON.parse(cached)
        const now = Date.now()
        const currentHash = generateItemsHash(shoppingList)

        // Check if cache is valid AND has results
        if (
          parsedCache.zipCode === resolvedZipCode &&
          parsedCache.itemsHash === currentHash &&
          now - parsedCache.timestamp < SEARCH_CACHE_TTL &&
          parsedCache.results.length > 0
        ) {
          setResults(parsedCache.results)
          setUsingCache(true)
        } else {
          // Cache invalid or empty - clear it
          localStorage.removeItem(SEARCH_CACHE_KEY)
        }
      }
    } catch (error) {
      console.error("Error loading cached search:", error)
      localStorage.removeItem(SEARCH_CACHE_KEY)
    }
  }, [resolvedZipCode]) // Reload when zip code resolves

  // -- Actions --
  const performMassSearch = useCallback(async () => {
    if (!shoppingList || shoppingList.length === 0) {
      toast({ title: "Empty List", description: "Add items first.", variant: "destructive" })
      return
    }

    // Check if we can use cached results
    const currentHash = generateItemsHash(shoppingList)
    try {
      const cached = localStorage.getItem(SEARCH_CACHE_KEY)
      if (cached) {
        const parsedCache: SearchCacheData = JSON.parse(cached)
        const now = Date.now()

        if (
          parsedCache.zipCode === resolvedZipCode &&
          parsedCache.itemsHash === currentHash &&
          now - parsedCache.timestamp < SEARCH_CACHE_TTL &&
          parsedCache.results.length > 0
        ) {
          setResults(parsedCache.results)
          setUsingCache(true)
          return // Don't perform search
        } else if (cached) {
          localStorage.removeItem(SEARCH_CACHE_KEY)
        }
      }
    } catch (error) {
      console.error("Error checking cache:", error)
    }

    setLoading(true)
    setActiveStoreIndex(0)
    setUsingCache(false)

    try {
      const zipForSearch = resolvedZipCode || undefined
      const aggregatedSearchData: Array<{ item: ShoppingListItem; storeResults: StoreSearchResults }> = []

      for (let startIndex = 0; startIndex < shoppingList.length; startIndex += SEARCH_BATCH_SIZE) {
        const batch = shoppingList.slice(startIndex, startIndex + SEARCH_BATCH_SIZE)
        const batchResults = await Promise.all(batch.map(async (item) => {
          try {
            const storeResults = await searchGroceryStores(
              item.name,
              zipForSearch,
              undefined,
              item.recipe_id ?? undefined
            )
            return { item, storeResults }
          } catch (error) {
            console.error("[useStoreComparison] search failed for", item.name, error)
            return { item, storeResults: [] }
          }
        }))
        aggregatedSearchData.push(...batchResults)
      }

      const searchData = aggregatedSearchData
      const storeMap = new Map<string, StoreComparison>()

      searchData.forEach(({ item, storeResults }) => {
        const validResults = storeResults.filter(r => r.items && r.items.length > 0)

        validResults.forEach(storeResult => {
          const storeName = storeResult.store.trim()

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

          const bestOption = storeResult.items.reduce((min, curr) =>
            curr.price < min.price ? curr : min
          )

          const qty = item.quantity || 1
          entry.items.push({
            ...bestOption,
            shoppingItemId: item.id,
            originalName: item.name,
            quantity: qty
          })
          entry.total += bestOption.price * qty
        })
      })

      // Merge similar items within each store to optimize display
      storeMap.forEach((store) => {
        const itemMap = new Map<string, typeof store.items[0] & { shoppingItemIds: string[] }>()

        store.items.forEach(item => {
          const key = item.title.toLowerCase().trim()
          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!
            const oldTotal = existing.price * (existing.quantity || 1)
            const newQuantity = (existing.quantity || 1) + (item.quantity || 1)
            const newTotal = item.price * newQuantity

            // Update total if price or quantity changed
            store.total = store.total - oldTotal + newTotal

            itemMap.set(key, {
              ...existing,
              quantity: newQuantity,
              shoppingItemIds: [...existing.shoppingItemIds, item.shoppingItemId]
            })
          } else {
            itemMap.set(key, {
              ...item,
              shoppingItemIds: [item.shoppingItemId]
            })
          }
        })

        store.items = Array.from(itemMap.values())
      })

      let comparisons = Array.from(storeMap.values())

      comparisons = comparisons.map(comp => {
        const foundItemIds = new Set<string>()
        comp.items.forEach(i => {
          const itemIds = (i as any).shoppingItemIds || [i.shoppingItemId]
          itemIds.forEach((id: string) => foundItemIds.add(id))
        })
        const missingIngredients = shoppingList.filter(item => !foundItemIds.has(item.id))
        
        return {
          ...comp,
          missingCount: missingIngredients.length,
          missingItems: missingIngredients.length > 0,
          missingIngredients: missingIngredients 
        }
      })
      
      if (comparisons.length > 0) {
        const maxTotal = Math.max(...comparisons.map(c => c.total))
        comparisons.forEach(c => {
           c.savings = maxTotal - c.total
        })
      }

      setResults(comparisons)

      // Cache the results
      try {
        const cacheData: SearchCacheData = {
          results: comparisons,
          timestamp: Date.now(),
          itemsHash: currentHash,
          zipCode: resolvedZipCode,
        }
        localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cacheData))
      } catch (error) {
        console.error("Error caching search results:", error)
      }

    } catch (error) {
      console.error("Mass search error:", error)
      toast({ title: "Search failed", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [shoppingList, resolvedZipCode, toast])

  // -- FIX: IMMUTABLE STATE PATCHER --
  // This ensures price changes trigger a re-render by creating new object references
  const replaceItemForStore = useCallback((
    storeName: string,
    shoppingItemId: string,
    newItem: GroceryItem
  ) => {
    // Invalidate cache when manually replacing items
    try {
      localStorage.removeItem(SEARCH_CACHE_KEY)
    } catch (error) {
      console.error("Error invalidating cache:", error)
    }

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

  const sortedResults = useMemo(() => {
    const sorted = [...results]
    sorted.sort((a, b) => {
      const aMissing = a.missingCount || 0
      const bMissing = b.missingCount || 0
      if (aMissing !== bMissing) return aMissing - bMissing
      return a.total - b.total
    })
    return sorted
  }, [results, sortMode])

  // -- Updated Navigation --
  const scrollToStore = useCallback((index: number) => {
    if (sortedResults.length === 0) return
    const safeIndex = Math.max(0, Math.min(index, sortedResults.length - 1))
    
    // Explicitly update the active index to trigger price detail rendering
    setActiveStoreIndex(safeIndex)

    if (carouselRef.current) {
        const container = carouselRef.current
        const scrollAmount = container.scrollWidth * (safeIndex / sortedResults.length)
        container.scrollTo({ left: scrollAmount, behavior: 'smooth' })
    }
  }, [sortedResults.length])

  const handleScroll = useCallback(() => {
    if (!carouselRef.current || sortedResults.length === 0) return
    const container = carouselRef.current
    const totalWidth = container.scrollWidth - container.clientWidth
    const scrollRatio = container.scrollLeft / totalWidth
    const newIndex = Math.round(scrollRatio * (sortedResults.length - 1))
    if (newIndex !== activeStoreIndex && !isNaN(newIndex)) {
      setActiveStoreIndex(newIndex)
    }
  }, [activeStoreIndex, sortedResults.length])

  const nextStore = () => scrollToStore(activeStoreIndex + 1)
  const prevStore = () => scrollToStore(activeStoreIndex - 1)

  // Recalculate totals based on current shopping list quantities without re-fetching
  const recalculateTotals = useCallback(() => {
    setResults(prevResults => {
      return prevResults.map(store => {
        let newTotal = 0

        const updatedItems = store.items.map(item => {
          // Find the current quantity from the shopping list
          const shoppingItemIds = (item as any).shoppingItemIds || [item.shoppingItemId]
          let totalQty = 0

          shoppingItemIds.forEach((id: string) => {
            const shoppingItem = shoppingList.find(i => i.id === id)
            if (shoppingItem) {
              totalQty += shoppingItem.quantity || 1
            }
          })

          if (totalQty > 0) {
            const itemCost = item.price * totalQty
            newTotal += itemCost
            return {
              ...item,
              quantity: totalQty
            }
          }

          return item
        })

        return {
          ...store,
          items: updatedItems,
          total: newTotal
        }
      })
    })
  }, [shoppingList])

  return {
    results: sortedResults,
    loading,
    performMassSearch,
    setResults,
    activeStoreIndex,
    carouselRef,
    scrollToStore,
    handleScroll,
    nextStore,
    prevStore,
    sortMode,
    setSortMode,
    replaceItemForStore,
    usingCache,
    recalculateTotals
  }
}
