"use client"

import { useState, useCallback } from "react"
import { useMapsLibrary } from "@vis.gl/react-google-maps"
import type { StoreComparison } from "@/lib/types/store"
import { canonicalizeStoreName, geocodeMultipleStores } from "@/lib/geocoding-adapter"

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

    try {
      // Step 1: Use PostGIS to geocode stores and get distances
      // This is much faster and cheaper than Google Distance Matrix
      const storeNames = comparisons.map(c => c.store)
      const geocodedStores = await geocodeMultipleStores(storeNames, undefined, userLocation, 20)

      // Find closest store by PostGIS straight-line distance
      let minDistanceMiles = Infinity
      let closestIdx = -1

      comparisons.forEach((comparison, idx) => {
        const canonical = canonicalizeStoreName(comparison.store)
        const geocoded = geocodedStores.get(canonical)

        if (geocoded) {
          // Calculate straight-line distance using Haversine
          const distance = calculateHaversineDistance(
            userLocation.lat,
            userLocation.lng,
            geocoded.lat,
            geocoded.lng
          )

          if (distance < minDistanceMiles) {
            minDistanceMiles = distance
            closestIdx = idx
          }
        }
      })

      setClosestIndex(closestIdx !== -1 ? closestIdx : null)

      // Step 2: Use Google Distance Matrix for driving times and distances
      // This provides user-friendly travel information (duration, route distance)
      const service = new google.maps.DistanceMatrixService()

      const destinations = comparisons.map(c => {
        const canonical = canonicalizeStoreName(c.store)
        const geocoded = geocodedStores.get(canonical)

        // Use geocoded coordinates if available, otherwise fallback to location hint
        if (geocoded) {
          return { lat: geocoded.lat, lng: geocoded.lng }
        }
        return c.locationHint || c.store
      })

      const response = await service.getDistanceMatrix({
        origins: [userLocation],
        destinations: destinations,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      })

      const resultsMap = new Map<number, { distance: string; duration: string }>()

      if (response.rows[0]) {
        response.rows[0].elements.forEach((element, idx) => {
          if (element.status === "OK") {
            resultsMap.set(idx, {
              distance: element.distance.text,
              duration: element.duration.text
            })
          }
        })
      }

      setTravelData(resultsMap)

    } catch (error) {
      console.error("Closest store calculation error:", error)
    } finally {
      setIsLoading(false)
    }
  }, [routesLib])

/**
 * Calculate straight-line distance between two points using Haversine formula
 * Returns distance in miles
 */
function calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

  return { closestIndex, travelData, isLoading, calculateClosest }
}