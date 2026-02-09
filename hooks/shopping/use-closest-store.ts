"use client"

import { useState, useCallback } from "react"
import { useMapsLibrary } from "@vis.gl/react-google-maps"
import type { StoreComparison } from "@/lib/types/store"

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
      // Use Google Distance Matrix for travel times and distances.
      const service = new google.maps.DistanceMatrixService()

      const destinations = comparisons.map(c => {
        const lat = Number(c.latitude)
        const lng = Number(c.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng }
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
      let minDistanceMiles = Infinity
      let closestIdx = -1

      if (response.rows[0]) {
        response.rows[0].elements.forEach((element, idx) => {
          if (element.status === "OK") {
            resultsMap.set(idx, {
              distance: element.distance.text,
              duration: element.duration.text
            })

            const meters = element.distance?.value
            if (typeof meters === "number" && Number.isFinite(meters)) {
              const miles = meters / 1609.344
              if (miles < minDistanceMiles) {
                minDistanceMiles = miles
                closestIdx = idx
              }
            }
          }
        })
      }

      if (closestIdx === -1) {
        comparisons.forEach((comparison, idx) => {
          const lat = Number(comparison.latitude)
          const lng = Number(comparison.longitude)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

          const distance = calculateHaversineDistance(userLocation.lat, userLocation.lng, lat, lng)
          if (distance < minDistanceMiles) {
            minDistanceMiles = distance
            closestIdx = idx
          }
        })
      }

      setClosestIndex(closestIdx !== -1 ? closestIdx : null)
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
