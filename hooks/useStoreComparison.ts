"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import type { StoreComparison, ShoppingListItem, GroceryItem } from "@/lib/types/store"

export function useStoreComparison(
  shoppingList: ShoppingListItem[],
  zipCode: string,
  userLocation: { lat: number, lng: number } | null,
) {
  const { toast } = useToast()
  
  const [results, setResults] = useState<StoreComparison[]>([]) 
  const [loading, setLoading] = useState(false)
  const [activeStoreIndex, setActiveStoreIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [sortMode, setSortMode] = useState<"best-price" | "nearest" | "best-value">("best-price")

  // -- Actions --
  const performMassSearch = useCallback(async () => {
    if (!shoppingList || shoppingList.length === 0) {
      toast({ title: "Empty List", description: "Add items first.", variant: "destructive" })
      return
    }
    
    setLoading(true)
    setActiveStoreIndex(0)

    try {
      const searchPromises = shoppingList.map(async (item) => {
        const storeResults = await searchGroceryStores(item.name, zipCode)
        return { item, storeResults }
      })

      const searchData = await Promise.all(searchPromises)
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

      let comparisons = Array.from(storeMap.values())

      comparisons = comparisons.map(comp => {
        const foundItemIds = new Set(comp.items.map(i => i.shoppingItemId))
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

    } catch (error) {
      console.error("Mass search error:", error)
      toast({ title: "Search failed", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [shoppingList, zipCode, toast])

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
          if (item.shoppingItemId === shoppingItemId) {
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
    replaceItemForStore
  }
}