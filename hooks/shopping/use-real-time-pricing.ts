"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import type { ShoppingListIngredient as ShoppingListItem, StoreComparison } from "@/lib/types/store"
import { ingredientsRecentDB, type PricingResult } from "@/lib/database/ingredients-db"
import type { StoreMetadataMap } from "@/lib/utils/store-metadata"

const PRICING_DEBOUNCE_MS = 2000 // 2 seconds after shopping list changes
const STALE_THRESHOLD_MS = 300000 // 5 minutes

/**
 * Fetches user store metadata via API
 * @param userId - User ID
 * @param fallbackZip - Fallback zip code if user doesn't have one
 * @returns Map of store metadata by normalized store name
 */
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
      console.error("[useRealTimePricing] Failed to fetch store metadata")
      return new Map()
    }

    const { metadata } = await response.json()

    // Deserialize array back to Map
    const metadataMap = new Map()
    metadata.forEach((item: any) => {
      const storeName = item.storeName
      metadataMap.set(storeName, {
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
    console.error("[useRealTimePricing] Error fetching store metadata:", error)
    return new Map()
  }
}

/**
 * Hook for real-time pricing updates on shopping list changes
 * Automatically fetches pricing on mount and when shopping list changes (debounced)
 *
 * @param shoppingList - Current shopping list items
 * @param userId - User ID for fetching pricing
 * @param zipCode - Zip code for store metadata
 * @returns Pricing data, store metadata, loading state, and store selector state
 */
export function useRealTimePricing(
  shoppingList: ShoppingListItem[],
  userId: string | undefined,
  zipCode: string
) {
  const [pricingData, setPricingData] = useState<PricingResult[]>([])
  const [storeMetadata, setStoreMetadata] = useState<StoreMetadataMap>(new Map())
  const [loading, setLoading] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Main pricing fetch function
  const fetchPricing = useCallback(async () => {
    if (!userId || shoppingList.length === 0) {
      setPricingData([])
      setStoreMetadata(new Map())
      setLastFetchTime(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch pricing and metadata in parallel
      const [pricing, metadata] = await Promise.all([
        ingredientsRecentDB.getPricingForUser(userId),
        fetchUserStoreMetadata(userId, zipCode)
      ])

      setPricingData(pricing)
      setStoreMetadata(metadata)
      setLastFetchTime(Date.now())

      console.log("[useRealTimePricing] Pricing fetched", {
        entries: pricing.length,
        stores: metadata.size
      })
    } catch (err) {
      console.error("[useRealTimePricing] Pricing fetch failed:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch pricing")
    } finally {
      setLoading(false)
    }
  }, [userId, zipCode, shoppingList.length])

  // Debounced fetch function
  const debouncedFetchPricing = useCallback(() => {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current)
    }

    fetchTimerRef.current = setTimeout(() => {
      void fetchPricing()
    }, PRICING_DEBOUNCE_MS)
  }, [fetchPricing])

  // Auto-fetch on mount and when shopping list changes
  useEffect(() => {
    // Immediate fetch on mount or when user changes
    if (shoppingList.length > 0 && userId) {
      fetchPricing()
    }
  }, [userId]) // Only re-run when userId changes

  // Debounced fetch when shopping list changes
  useEffect(() => {
    if (shoppingList.length > 0 && userId && lastFetchTime !== null) {
      // Only debounce if we've already fetched once
      debouncedFetchPricing()
    }
  }, [shoppingList.length]) // Re-run when item count changes

  // Background gap filling (optional - runs after initial fetch)
  useEffect(() => {
    if (!userId || pricingData.length === 0) return

    const fillGaps = async () => {
      try {
        const gaps = await ingredientsRecentDB.getPricingGaps(userId)
        if (gaps.length > 0) {
          console.log("[useRealTimePricing] Found pricing gaps", { count: gaps.length })
          // Note: Gap filling is expensive, so we just log it here
          // The actual gap hydration can be triggered manually if needed
        }
      } catch (error) {
        console.error("[useRealTimePricing] Gap check failed:", error)
      }
    }

    fillGaps()
  }, [userId, pricingData.length])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current)
      }
    }
  }, [])

  // Check if data is stale
  const isStale = useMemo(() => {
    if (!lastFetchTime) return false
    return Date.now() - lastFetchTime > STALE_THRESHOLD_MS
  }, [lastFetchTime])

  // Manual refresh function
  const refetch = useCallback(() => {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current)
      fetchTimerRef.current = null
    }
    void fetchPricing()
  }, [fetchPricing])

  return {
    pricingData,
    storeMetadata,
    loading,
    selectedStore,
    setSelectedStore,
    refetch,
    lastFetchTime,
    isStale,
    error
  }
}
