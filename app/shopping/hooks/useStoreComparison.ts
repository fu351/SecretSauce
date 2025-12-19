"use client"

import { useState, useCallback, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import type { ShoppingListItem, GroceryItem } from "./useShoppingList"

export interface StoreComparison {
  store: string
  items: GroceryItem[]
  total: number
  savings: number
  outOfRadius?: boolean
  distanceMiles?: number
}

/**
 * Hook for managing store comparison carousel and search state
 * Handles multi-store price comparison and carousel navigation
 */
export function useStoreComparison() {
  const { toast } = useToast()
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [massSearchResults, setMassSearchResults] = useState<StoreComparison[]>([])
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [missingItems, setMissingItems] = useState<ShoppingListItem[]>([])
  const carouselRef = useRef<HTMLDivElement>(null)

  // Perform mass search across all stores
  const performMassSearch = useCallback(
    async (items: ShoppingListItem[], zipCode?: string) => {
      if (items.length === 0) return

      setComparisonLoading(true)
      try {
        const storeMap = new Map<string, StoreComparison>()
        const missing: ShoppingListItem[] = []

        // OPTIMIZED: Search all ingredients in parallel instead of sequentially
        const searchPromises = items.map(async (item) => {
          const storeResults = await searchGroceryStores(item.name, zipCode, undefined, item.recipeId)
          return { item, storeResults }
        })

        // Wait for all searches to complete
        const allResults = await Promise.all(searchPromises)

        // Process all results
        for (const { item, storeResults } of allResults) {
          const hasResults = storeResults.length > 0

          if (!hasResults) {
            missing.push(item)
            continue
          }

          storeResults.forEach((storeResult) => {
            if (!storeMap.has(storeResult.store)) {
              storeMap.set(storeResult.store, {
                store: storeResult.store,
                items: [],
                total: 0,
                savings: 0,
              })
            }

            const store = storeMap.get(storeResult.store)!
            const bestItem = storeResult.items.reduce((best, current) =>
              current.price < best.price ? current : best
            )

            if (bestItem) {
              store.items.push({
                ...bestItem,
                shoppingItemId: item.id,
              })
              store.total += bestItem.price * item.quantity
            }
          })
        }

        const comparisons = Array.from(storeMap.values())
        const minTotal = Math.min(...comparisons.map((c) => c.total))

        // Calculate savings for each store
        comparisons.forEach((comparison) => {
          comparison.savings = comparison.total - minTotal
        })

        comparisons.sort((a, b) => a.total - b.total)

        setMassSearchResults(comparisons)
        setMissingItems(missing)
        setCarouselIndex(0) // Reset to first store
      } catch (error) {
        console.error("Error performing mass search:", error)
        toast({
          title: "Search error",
          description: "Failed to perform mass search. Please try again.",
          variant: "destructive",
        })
      } finally {
        setComparisonLoading(false)
      }
    },
    [toast]
  )

  // Navigate to next store in carousel
  const nextStore = useCallback(() => {
    if (carouselIndex < massSearchResults.length - 1) {
      scrollToStore(carouselIndex + 1)
    }
  }, [carouselIndex, massSearchResults.length])

  // Navigate to previous store in carousel
  const prevStore = useCallback(() => {
    if (carouselIndex > 0) {
      scrollToStore(carouselIndex - 1)
    }
  }, [carouselIndex])

  // Scroll carousel to specific store index
  const scrollToStore = useCallback((index: number) => {
    if (carouselRef.current) {
      const cardWidth = carouselRef.current.scrollWidth / massSearchResults.length
      carouselRef.current.scrollTo({
        left: cardWidth * index,
        behavior: "smooth",
      })
      setCarouselIndex(index)
    }
  }, [massSearchResults.length])

  return {
    carouselIndex,
    setCarouselIndex,
    massSearchResults,
    setMassSearchResults,
    comparisonLoading,
    missingItems,
    setMissingItems,
    carouselRef,
    performMassSearch,
    nextStore,
    prevStore,
    scrollToStore,
  }
}
