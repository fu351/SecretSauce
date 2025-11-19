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
const postalCodeCache = new Map<string, GeocodeResult>()
const KM_TO_MILES = 0.621371
const METERS_TO_MILES = 0.000621371

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
  userCoordinates?: { lat: number; lng: number },
  groceryDistanceMiles: number = 10,
  storeHint?: string,
  options?: { relaxed?: boolean }
): Promise<GeocodeResult | null> {
  try {
    const isRelaxed = options?.relaxed ?? false
    // Check cache first
    const locationKey = userCoordinates ? `${userCoordinates.lat.toFixed(4)},${userCoordinates.lng.toFixed(4)}` : "none"
    const hintKey = storeHint ? storeHint.toLowerCase().trim() : "none"
    const cacheKey = `${storeName}-${userPostalCode || "none"}-${locationKey}-${hintKey}`
    if (geocodeCache.has(cacheKey)) {
      const cached = geocodeCache.get(cacheKey)
      console.log(`[Geocoding] Cache hit for ${storeName}`)
      return cached || null
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.error("Google Maps API key not found in environment variables")
      return null
    }

    const baseAllowedMiles = Math.max(((groceryDistanceMiles ?? 10) * 2), 75)
    const allowedMiles = isRelaxed ? baseAllowedMiles * 2 : baseAllowedMiles
    const allowedDriveMiles = Math.max(groceryDistanceMiles || 10, 1) * (isRelaxed ? 4 : 2)

    const searchOrigins: Array<{ lat: number; lng: number; source: "user" | "postal" }> = []
    if (userCoordinates) {
      searchOrigins.push({ ...userCoordinates, source: "user" })
    }
    if (userPostalCode) {
      const postalCoords = await geocodePostalCode(userPostalCode)
      if (postalCoords && (!userCoordinates || postalCoords.lat !== userCoordinates.lat || postalCoords.lng !== userCoordinates.lng)) {
        searchOrigins.push({ ...postalCoords, source: "postal" })
      }
    }

    for (const origin of searchOrigins) {
      // primary attempt using configured radius
      let nearestStore = await findNearestStoreWithPlaces(
        storeName,
        { lat: origin.lat, lng: origin.lng },
        apiKey,
        groceryDistanceMiles,
        storeHint
      )

      // double-check with a larger radius if nothing is found
      if (!nearestStore) {
        const expandedRadius = Math.max(groceryDistanceMiles * 2, groceryDistanceMiles + 5, 10)
        if (expandedRadius !== groceryDistanceMiles) {
          nearestStore = await findNearestStoreWithPlaces(
            storeName,
            { lat: origin.lat, lng: origin.lng },
            apiKey,
            expandedRadius,
            storeHint
          )
          if (nearestStore) {
            console.log("[Geocoding] Found store after radius expansion", {
              storeName,
              expandedRadius,
              origin: origin.source,
            })
          }
        }
      }

      if (nearestStore) {
        console.log("[Geocoding] Places result", {
          storeName,
          origin: origin.source,
          storeHint,
          nearestStore,
        })
        if (userCoordinates) {
          const routeCheck = await verifyRouteDistance(userCoordinates, nearestStore, apiKey)
          if (routeCheck.ok && routeCheck.distanceMiles !== undefined) {
            if (routeCheck.distanceMiles > allowedDriveMiles) {
              console.warn(
                `[Geocoding] ${storeName} driving distance ${routeCheck.distanceMiles.toFixed(
                  1
                )} miles exceeds limit (${allowedDriveMiles.toFixed(1)}).`
              )
              if (!isRelaxed) {
                continue
              }
            }
          }
          // if route check fails we fall back to straight-line validation later
        }

        geocodeCache.set(cacheKey, nearestStore)
        return nearestStore
      }
    }

    // Build search query: store name + postal code for better accuracy
    const baseQuery = storeHint || storeName
    const searchQuery = userPostalCode ? `${baseQuery} ${userPostalCode}` : baseQuery
    console.log(`[Geocoding] Attempting to geocode ${storeName} with query: ${searchQuery}`)

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

    if (userCoordinates) {
      const distanceKm = calculateDistance(
        userCoordinates.lat,
        userCoordinates.lng,
        result.lat,
        result.lng
      )
      const distanceMiles = distanceKm * KM_TO_MILES
      if (distanceMiles > allowedMiles) {
        console.warn(
          `[Geocoding] ${storeName} geocoded ${distanceMiles.toFixed(
            1
          )} miles away (limit ${allowedMiles.toFixed(1)}).${isRelaxed ? " Keeping due to relaxed mode." : " Ignoring this result."}`
        )
        if (!isRelaxed) {
          return null
        }
      }

      const routeCheck = await verifyRouteDistance(userCoordinates, result, apiKey)
      if (!routeCheck.ok) {
        console.warn(`[Geocoding] Routes API failed for ${storeName}, relying on straight-line distance.`)
      } else if (routeCheck.distanceMiles !== undefined) {
        if (routeCheck.distanceMiles > allowedDriveMiles) {
          console.warn(
            `[Geocoding] ${storeName} driving distance ${routeCheck.distanceMiles.toFixed(
              1
            )} miles exceeds limit (${allowedDriveMiles.toFixed(1)}).${isRelaxed ? " Keeping due to relaxed mode." : " Ignoring this result."}`
          )
          if (!isRelaxed) {
            return null
          }
        }
      }
    }

    geocodeCache.set(cacheKey, result)
    console.log(`[Geocoding] Successfully geocoded ${storeName}: lat=${result.lat}, lng=${result.lng}`)

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
 * Use Google Places Text Search to find the closest matching store to the user's coordinates
 */
async function findNearestStoreWithPlaces(
  storeName: string,
  userCoordinates: { lat: number; lng: number },
  apiKey: string,
  groceryDistanceMiles: number,
  storeHint?: string
): Promise<GeocodeResult | null> {
  const keyword = storeHint ? `${storeName} ${storeHint}` : `${storeName} store`
  try {
    const effectiveMiles = Math.max(groceryDistanceMiles || 10, 1)
    const radiusMeters = Math.min(effectiveMiles * 1609.34, 50000) // Places API max radius 50km
    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${
      userCoordinates.lat
    },${userCoordinates.lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&type=store&key=${apiKey}`

    console.log("[Geocoding] Nearby search request", {
      storeName,
      keyword,
      userCoordinates,
      radiusMeters,
    })
    let response = await fetch(nearbyUrl)
    if (!response.ok) {
      console.error(`[Geocoding] Nearby search error for ${storeName}:`, response.statusText)
      return null
    }

    let data = await response.json()
    let candidates: any[] = []
    if (data.status === "OK" && data.results?.length) {
      candidates = data.results
    } else {
      // Fallback to Text Search if Nearby fails
      console.warn(`[Geocoding] Nearby search returned ${data.status} for ${storeName}, falling back to Text Search`)
      const textUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        keyword
      )}&location=${userCoordinates.lat},${userCoordinates.lng}&radius=${radiusMeters}&key=${apiKey}`
      console.log("[Geocoding] Text search request", { storeName, keyword, userCoordinates })
      response = await fetch(textUrl)
      if (!response.ok) {
        console.error(`[Geocoding] Places Text Search error for ${storeName}:`, response.statusText)
        return null
      }
      data = await response.json()
      if (data.status !== "OK" || !data.results?.length) {
        console.warn(`[Geocoding] Places Text Search returned ${data.status} for ${storeName}`)
        return null
      }
      candidates = data.results
    }

    const normalizedStoreName = storeName.toLowerCase()
    let selected = candidates
      .filter((result) => result.name && result.name.toLowerCase().includes(normalizedStoreName))
      .reduce((closest: any, current: any) => {
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
      }, candidates[0])

    if (!selected && candidates.length > 0) {
      selected = candidates[0]
    }

    if (!selected) {
      return null
    }

    const resolved = {
      lat: selected.geometry.location.lat,
      lng: selected.geometry.location.lng,
      formattedAddress: selected.vicinity || selected.formatted_address,
    }
    console.log("[Geocoding] Places result selected", { storeName, keyword, resolved })
    return resolved
  } catch (error) {
    console.error(`[Geocoding] Error finding nearest store for ${storeName}:`, error)
    return null
  }
}

async function verifyRouteDistance(
  origin: { lat: number; lng: number },
  destination: GeocodeResult,
  apiKey: string
): Promise<{ ok: boolean; distanceMiles?: number; duration?: string }> {
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    })

    if (!response.ok) {
      console.warn("[Geocoding] Routes API error:", response.statusText)
      return { ok: false }
    }

    const data = await response.json()
    const route = data.routes?.[0]
    if (!route || typeof route.distanceMeters !== "number") {
      return { ok: false }
    }

    const distanceMiles = route.distanceMeters * METERS_TO_MILES
    return {
      ok: true,
      distanceMiles,
      duration: route.duration,
    }
  } catch (error) {
    console.warn("[Geocoding] Failed to verify route distance:", error)
    return { ok: false }
  }
}

/**
 * Geocode multiple stores and return their coordinates
 * Useful for batch processing store comparison results
 */
export async function geocodeMultipleStores(
  storeNames: string[],
  userPostalCode?: string,
  userCoordinates?: { lat: number; lng: number },
  groceryDistanceMiles: number = 10,
  storeHints?: Map<string, string | undefined>
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>()

  console.log(`[Geocoding] Starting batch geocoding for ${storeNames.length} stores:`, storeNames)

  let resolvedCoordinates = userCoordinates
  if (!resolvedCoordinates && userPostalCode) {
    resolvedCoordinates = await geocodePostalCode(userPostalCode)
  }

  for (const storeName of storeNames) {
    let geocoded = await geocodeStore(
      storeName,
      userPostalCode,
      resolvedCoordinates ?? undefined,
      groceryDistanceMiles,
      storeHints?.get(storeName)
    )

    if (!geocoded) {
      console.warn(`[Geocoding] Retrying ${storeName} with relaxed constraints`)
      geocoded = await geocodeStore(
        storeName,
        userPostalCode,
        resolvedCoordinates ?? undefined,
        groceryDistanceMiles,
        storeHints?.get(storeName),
        { relaxed: true }
      )
    }

    if (geocoded) {
      results.set(storeName, geocoded)
      console.log(`[Geocoding] Successfully geocoded ${storeName}: lat=${geocoded.lat}, lng=${geocoded.lng}`)
    } else {
      console.warn(`[Geocoding] Failed to geocode ${storeName}`)
    }
  }

  console.log(`[Geocoding] Batch geocoding complete: ${results.size}/${storeNames.length} stores geocoded`)

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

export async function geocodePostalCode(postalCode: string): Promise<{ lat: number; lng: number } | null> {
  const normalized = postalCode?.trim()
  if (!normalized) return null

  if (postalCodeCache.has(normalized)) {
    const cached = postalCodeCache.get(normalized)!
    return { lat: cached.lat, lng: cached.lng }
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error("Google Maps API key not found; cannot geocode postal code")
    return null
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalized)}&key=${apiKey}`
    )

    if (!response.ok) {
      console.error(`[Geocoding] Postal code geocode error (${normalized}):`, response.statusText)
      return null
    }

    const data = await response.json()
    if (data.status !== "OK" || !data.results?.length) {
      console.warn(`[Geocoding] No results for postal code: ${normalized}`)
      return null
    }

    const { lat, lng } = data.results[0].geometry.location
    postalCodeCache.set(normalized, { lat, lng })
    return { lat, lng }
  } catch (error) {
    console.error(`[Geocoding] Error geocoding postal code ${normalized}:`, error)
    return null
  }
}
