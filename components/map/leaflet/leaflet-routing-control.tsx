"use client"

/**
 * Leaflet routing control component using OSRM
 * Displays routes from origin to multiple destinations
 */

import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import type { LatLng, RouteResult, TravelMode } from "@/lib/routing/types"
import { osrmService } from "@/lib/routing/osrm-service"

interface RoutingControlProps {
  origin: LatLng
  destinations: Array<{ index: number; latLng: LatLng; name: string }>
  mode: TravelMode
  showRoutes: boolean
  selectedIndex?: number
  onRoutesCalculated?: (routes: Map<number, RouteResult>) => void
  onError?: (error: Error) => void
}

export function RoutingControl({
  origin,
  destinations,
  mode,
  showRoutes,
  selectedIndex,
  onRoutesCalculated,
  onError,
}: RoutingControlProps) {
  const map = useMap()
  const polylinesRef = useRef<Map<number, L.Polyline>>(new Map())
  const isCalculatingRef = useRef(false)

  useEffect(() => {
    // Clean up all polylines when routes are hidden
    if (!showRoutes) {
      polylinesRef.current.forEach((polyline) => {
        map.removeLayer(polyline)
      })
      polylinesRef.current.clear()
      return
    }

    // Avoid duplicate calculations
    if (isCalculatingRef.current) {
      return
    }

    isCalculatingRef.current = true

    // Calculate routes for all destinations
    const calculateRoutes = async () => {
      try {
        console.log(`[Routing] Calculating ${destinations.length} routes in ${mode} mode`)

        const routes = await osrmService.getBatchRoutes(
          origin,
          destinations.map(({ index, latLng }) => ({ index, latLng })),
          mode
        )

        // Notify parent component of calculated routes
        if (onRoutesCalculated) {
          onRoutesCalculated(routes)
        }

        // Clear existing polylines
        polylinesRef.current.forEach((polyline) => {
          map.removeLayer(polyline)
        })
        polylinesRef.current.clear()

        // Create new polylines for each route
        routes.forEach((route, index) => {
          const isSelected = index === selectedIndex
          const color = isSelected ? "#ff6b6b" : "#4a90e2"
          const weight = isSelected ? 5 : 4
          const opacity = isSelected ? 0.9 : 0.7
          const zIndex = isSelected ? 1000 : 500

          const polyline = L.polyline(route.polyline.map((p) => [p.lat, p.lng]), {
            color,
            weight,
            opacity,
            smoothFactor: 1,
          })

          // Set z-index via pane for selected route to be on top
          if (isSelected) {
            polyline.setStyle({ className: "selected-route" })
          }

          polyline.addTo(map)
          polylinesRef.current.set(index, polyline)
        })

        console.log(`[Routing] Successfully displayed ${routes.size} routes`)
      } catch (error) {
        console.error("[Routing] Failed to calculate routes:", error)
        if (onError && error instanceof Error) {
          onError(error)
        }
      } finally {
        isCalculatingRef.current = false
      }
    }

    calculateRoutes()

    // Cleanup function
    return () => {
      polylinesRef.current.forEach((polyline) => {
        map.removeLayer(polyline)
      })
      polylinesRef.current.clear()
    }
  }, [map, origin, destinations, mode, showRoutes, selectedIndex, onRoutesCalculated, onError])

  // Update selected route styling when selection changes
  useEffect(() => {
    if (!showRoutes) return

    polylinesRef.current.forEach((polyline, index) => {
      const isSelected = index === selectedIndex
      const color = isSelected ? "#ff6b6b" : "#4a90e2"
      const weight = isSelected ? 5 : 4
      const opacity = isSelected ? 0.9 : 0.7

      polyline.setStyle({
        color,
        weight,
        opacity,
      })

      // Bring selected route to front
      if (isSelected) {
        polyline.bringToFront()
      }
    })
  }, [selectedIndex, showRoutes])

  return null
}
