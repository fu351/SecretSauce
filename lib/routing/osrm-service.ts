/**
 * OSRM (Open Source Routing Machine) routing service
 * Provides free, open-source routing without API keys
 */

import { decode } from "@mapbox/polyline"
import type { LatLng, RouteResult, TravelMode, OSRMRouteResponse } from "./types"

const METERS_TO_MILES = 0.000621371

export class OSRMRoutingService {
  private baseUrl: string
  private timeout: number
  private cache: Map<string, RouteResult>

  constructor(baseUrl = "https://router.project-osrm.org", timeout = 12000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
    this.cache = new Map()
  }

  /**
   * Calculate a single route between origin and destination
   */
  async getRoute(origin: LatLng, destination: LatLng, mode: TravelMode): Promise<RouteResult> {
    const cacheKey = this.getCacheKey(origin, destination, mode)

    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log(`[OSRM] Cache hit for ${mode} route`)
      return this.cache.get(cacheKey)!
    }

    const profile = mode === "driving" ? "car" : "foot"
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
    const url = `${this.baseUrl}/route/v1/${profile}/${coords}`

    const params = new URLSearchParams({
      overview: "full",
      geometries: "polyline",
      steps: "true",
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${url}?${params}`, {
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`OSRM request failed: ${response.statusText}`)
      }

      const data: OSRMRouteResponse = await response.json()

      if (data.code !== "Ok" || !data.routes.length) {
        throw new Error("No route found")
      }

      const route = data.routes[0]
      const polyline = decode(route.geometry).map(([lat, lng]) => ({ lat, lng }))

      const result: RouteResult = {
        polyline,
        distance: route.distance * METERS_TO_MILES,
        duration: route.duration,
        durationText: this.formatDuration(route.duration),
      }

      // Cache the result
      this.cache.set(cacheKey, result)

      console.log(`[OSRM] Route calculated: ${result.distance.toFixed(1)} mi, ${result.durationText}`)

      return result
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Route calculation timeout")
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Calculate multiple routes in parallel with concurrency control
   */
  async getBatchRoutes(
    origin: LatLng,
    destinations: Array<{ index: number; latLng: LatLng }>,
    mode: TravelMode
  ): Promise<Map<number, RouteResult>> {
    const results = new Map<number, RouteResult>()

    // Process in parallel with concurrency limit to avoid overwhelming the server
    const batchSize = 5
    for (let i = 0; i < destinations.length; i += batchSize) {
      const batch = destinations.slice(i, i + batchSize)
      const promises = batch.map(({ index, latLng }) =>
        this.getRoute(origin, latLng, mode)
          .then((route) => ({ index, route }))
          .catch((error) => {
            console.error(`[OSRM] Route ${index} failed:`, error)
            return null
          })
      )

      const batchResults = await Promise.all(promises)
      batchResults.forEach((result) => {
        if (result) {
          results.set(result.index, result.route)
        }
      })
    }

    return results
  }

  /**
   * Format duration in seconds to human-readable string
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.round((seconds % 3600) / 60)

    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
    }
    return `${minutes} min${minutes !== 1 ? "s" : ""}`
  }

  /**
   * Generate cache key for route
   */
  private getCacheKey(origin: LatLng, destination: LatLng, mode: TravelMode): string {
    const originKey = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`
    const destKey = `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`
    return `${originKey}|${destKey}|${mode}`
  }

  /**
   * Clear the route cache
   */
  clearCache(): void {
    this.cache.clear()
    console.log("[OSRM] Cache cleared")
  }
}

// Singleton instance
export const osrmService = new OSRMRoutingService()
