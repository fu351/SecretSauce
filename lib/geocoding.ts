/**
 * Geocoding utility for converting store names to coordinates using Google Geocoding API
 */

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress?: string
}

// Simple in-memory cache for geocoding results (resets on page reload)
const geocodeCache = new Map<string, GeocodeResult>()

/**
 * Geocode a store name to get its latitude and longitude
 * Uses Google Geocoding API to find the closest match
 *
 * @param storeName - The name of the store to geocode
 * @param userPostalCode - User's postal code (for proximity weighting)
 * @param userCoordinates - User's current coordinates (for finding closest store)
 * @returns Promise with latitude, longitude, and formatted address
 */
export async function geocodeStore(
  storeName: string,
  userPostalCode?: string,
  userCoordinates?: { lat: number; lng: number }
): Promise<GeocodeResult | null> {
  try {
    // Check cache first
    const cacheKey = `${storeName}-${userPostalCode || "none"}`
    if (geocodeCache.has(cacheKey)) {
      return geocodeCache.get(cacheKey) || null
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.error("Google Maps API key not found in environment variables")
      return null
    }

    // Build search query: store name + postal code for better accuracy
    const searchQuery = userPostalCode ? `${storeName} ${userPostalCode}` : storeName

    // Call Google Geocoding API
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        searchQuery
      )}&key=${apiKey}`
    )

    if (!response.ok) {
      console.error("Geocoding API error:", response.statusText)
      return null
    }

    const data = await response.json()

    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      console.warn(`No geocoding results found for: ${storeName}`)
      return null
    }

    // If user coordinates provided, find the closest result
    let selectedResult = data.results[0]

    if (userCoordinates && data.results.length > 1) {
      selectedResult = data.results.reduce((closest: any, current: any) => {
        const closestDist = calculateDistance(
          userCoordinates.lat,
          userCoordinates.lng,
          closest.geometry.location.lat,
          closest.geometry.location.lng
        )

        const currentDist = calculateDistance(
          userCoordinates.lat,
          userCoordinates.lng,
          current.geometry.location.lat,
          current.geometry.location.lng
        )

        return currentDist < closestDist ? current : closest
      })
    }

    const result: GeocodeResult = {
      lat: selectedResult.geometry.location.lat,
      lng: selectedResult.geometry.location.lng,
      formattedAddress: selectedResult.formatted_address,
    }

    // Cache the result
    geocodeCache.set(cacheKey, result)

    return result
  } catch (error) {
    console.error("Geocoding error:", error)
    return null
  }
}

/**
 * Calculate distance between two geographic coordinates in kilometers
 * Uses Haversine formula for great-circle distance
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth's radius in kilometers
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

/**
 * Geocode multiple stores and return their coordinates
 * Useful for batch processing store comparison results
 */
export async function geocodeMultipleStores(
  storeNames: string[],
  userPostalCode?: string,
  userCoordinates?: { lat: number; lng: number }
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>()

  for (const storeName of storeNames) {
    const geocoded = await geocodeStore(storeName, userPostalCode, userCoordinates)
    if (geocoded) {
      results.set(storeName, geocoded)
    }
  }

  return results
}

/**
 * Get user's current location using browser Geolocation API
 */
export async function getUserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser")
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (error) => {
        console.warn("Geolocation error:", error)
        resolve(null)
      },
      {
        timeout: 10000,
        enableHighAccuracy: false,
      }
    )
  })
}
