"use client"

import { useState, useCallback } from "react"
import { useMapsLibrary } from "@vis.gl/react-google-maps"
import type { StoreComparison } from "@/lib/types/store-comparison"
import { canonicalizeStoreName } from "@/lib/geocoding" // Reuse your existing logic

interface ClosestStoreResult {
  closestIndex: number | null
  travelData: Map<number, { distance: string; duration: string }>
  isLoading: boolean
  calculateClosest: (userLocation: google.maps.LatLngLiteral, comparisons: StoreComparison[]) => Promise<void>
}

export function useClosestStore(): ClosestStoreResult {
  const [isLoading, setIsLoading] = useState(false)
  const [closestIndex, setClosestIndex] = useState<number | null>(null)
  const [travelData, setTravelData] = useState<Map<number, { distance: string; duration: string }>>(new Map())
  
  const routesLib = useMapsLibrary("routes")

  const calculateClosest = useCallback(async (
    userLocation: google.maps.LatLngLiteral, 
    comparisons: StoreComparison[]
  ) => {
    // Guard against missing libraries or location data
    if (!routesLib || !comparisons.length || !userLocation) return

    setIsLoading(true)
    const service = new google.maps.DistanceMatrixService()

    // 1. IMPROVED NAME HANDLING:
    // We prioritize geocoded coordinates if they exist, otherwise use a normalized search string.
    const destinations = comparisons.map(c => {
      // If we already have a location hint (address), use it for 100% accuracy.
      if (c.locationHint) return c.locationHint;
      
      // Otherwise, create a search string "Store Name near User" to help Google find the right one.
      return `${c.store}`; 
    })

    try {
      const response = await service.getDistanceMatrix({
        origins: [userLocation],
        destinations: destinations,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      })

      const resultsMap = new Map<number, { distance: string; duration: string }>()
      let minDistanceValue = Infinity
      let bestIdx = -1

      if (response.rows[0]) {
        response.rows[0].elements.forEach((element, idx) => {
          if (element.status === "OK") {
            const distanceVal = element.distance.value 
            
            resultsMap.set(idx, { 
              distance: element.distance.text, 
              duration: element.duration.text 
            })

            // Track the store with the lowest physical distance
            if (distanceVal < minDistanceValue) {
              minDistanceValue = distanceVal
              bestIdx = idx
            }
          }
        })
      }

      setTravelData(resultsMap)
      setClosestIndex(bestIdx !== -1 ? bestIdx : null)
    } catch (error) {
      console.error("Distance Matrix Error:", error)
    } finally {
      setIsLoading(false)
    }
  }, [routesLib])

  return { closestIndex, travelData, isLoading, calculateClosest }
}