/**
 * Geocoding utility for converting store names to coordinates using Google Geocoding API
 */

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress?: string
  matchedName?: string
}

const postalCodeCache = new Map<string, GeocodeResult>()
const KM_TO_MILES = 0.621371
const METERS_TO_MILES = 0.000621371
const DIACRITIC_REGEX = /[\u0300-\u036f]/g
const CURLY_APOSTROPHE_REGEX = /[\u2019\u2018]/g

const cleanStoreValue = (value: string) =>
  value
    .normalize("NFKD")
    .replace(DIACRITIC_REGEX, "")
    .replace(CURLY_APOSTROPHE_REGEX, "'")

const normalizeStoreMatchValue = (value?: string): string => {
  if (!value) return ""
  return cleanStoreValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

const coordinatesAppearValid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)

export function canonicalizeStoreName(value: string): string {
  return cleanStoreValue(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

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

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.error("Google Maps API key not found in environment variables")
      return null
    }

    const baseRadius = Math.max(groceryDistanceMiles ?? 10, 5)
    const allowedMiles = baseRadius * (isRelaxed ? 3 : 1.5)
    const allowedDriveMiles = baseRadius * (isRelaxed ? 4 : 2)
    const strictHintLimitMiles = baseRadius * 3

    if (storeHint) {
      const hintResult = await geocodeStoreHint(storeName, storeHint, apiKey, userCoordinates, strictHintLimitMiles)
      if (hintResult) {
        console.log("[Geocoding] Using direct hint geocode result", {
          storeName,
          storeHint,
          coordinates: hintResult,
        })
        return hintResult
      }
    }

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
        storeHint,
        userPostalCode
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
            storeHint,
            userPostalCode
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
      matchedName: selectedResult.address_components?.[0]?.long_name || storeHint || storeName,
    }

    if (!coordinatesAppearValid(result.lat, result.lng)) {
      console.warn(`[Geocoding] ${storeName} fallback geocode returned invalid coordinates`, {
        coordinates: result,
        searchQuery,
      })
      return null
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

    console.log(`[Geocoding] Successfully geocoded ${storeName}: lat=${result.lat}, lng=${result.lng}`)

    return result
  } catch (error) {
    console.error("Geocoding error:", error)
    return null
  }
}

async function geocodeStoreHint(
  storeName: string,
  storeHint: string,
  apiKey: string,
  userCoordinates?: { lat: number; lng: number },
  strictRadiusMiles?: number
): Promise<GeocodeResult | null> {
  const trimmedHint = storeHint?.trim()
  if (!trimmedHint) {
    return null
  }

  try {
    const query =
      trimmedHint.toLowerCase().includes(storeName.toLowerCase()) ? trimmedHint : `${storeName} ${trimmedHint}`

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    )

    if (!response.ok) {
      console.warn(`[Geocoding] Hint geocode error for ${storeName}:`, response.statusText)
      return null
    }

    const data = await response.json()
    if (data.status !== "OK" || !data.results?.length) {
      return null
    }

    const candidate = data.results[0]
    const resolved: GeocodeResult = {
      lat: candidate.geometry.location.lat,
      lng: candidate.geometry.location.lng,
      formattedAddress: candidate.formatted_address,
      matchedName: storeHint || candidate.address_components?.[0]?.long_name,
    }

    if (!coordinatesAppearValid(resolved.lat, resolved.lng)) {
      console.warn(`[Geocoding] Hint result for ${storeName} returned invalid coordinates`, {
        storeHint,
        resolved,
      })
      return null
    }

    if (userCoordinates && typeof strictRadiusMiles === "number") {
      const straightDistanceMiles =
        calculateDistance(userCoordinates.lat, userCoordinates.lng, resolved.lat, resolved.lng) * KM_TO_MILES
      if (straightDistanceMiles > strictRadiusMiles) {
        console.warn(`[Geocoding] Hint result for ${storeName} exceeded radius`, {
          straightDistanceMiles,
          strictRadiusMiles,
          storeHint,
        })
        return null
      }
    }

    return resolved
  } catch (error) {
    console.warn(`[Geocoding] Failed to geocode hint for ${storeName}:`, error)
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
  storeHint?: string,
  postalCode?: string
): Promise<GeocodeResult | null> {
  const keywordParts = [storeName, storeHint, postalCode ? `zip ${postalCode}` : null].filter(Boolean)
  const keyword = keywordParts.length > 0 ? keywordParts.join(" ") : `${storeName} store`
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

    const normalizedStoreName = normalizeStoreMatchValue(storeName)
    const normalizedHint = normalizeStoreMatchValue(storeHint)
    const matchesRequestedStore = (value?: string) => {
      const normalized = normalizeStoreMatchValue(value)
      if (!normalized) return false
      if (normalizedStoreName && normalized.includes(normalizedStoreName)) return true
      if (normalizedHint && normalized.includes(normalizedHint)) return true
      return false
    }

    const preferredCandidates = candidates.filter(
      (candidate) => matchesRequestedStore(candidate.name) || matchesRequestedStore(candidate.vicinity)
    )
    const candidatePool = preferredCandidates.length > 0 ? preferredCandidates : candidates

    if (!candidatePool.length) {
      console.warn(`[Geocoding] Places search returned no usable candidates for ${storeName}`)
      return null
    }

    const sortedCandidates = candidatePool
      .map((candidate) => {
        const lat = candidate.geometry?.location?.lat ?? 0
        const lng = candidate.geometry?.location?.lng ?? 0
        return {
          candidate,
          distance: calculateDistance(userCoordinates.lat, userCoordinates.lng, lat, lng),
        }
      })
      .sort((a, b) => a.distance - b.distance)

    for (const entry of sortedCandidates) {
      const candidate = entry.candidate
      const lat = candidate.geometry?.location?.lat
      const lng = candidate.geometry?.location?.lng
      if (!coordinatesAppearValid(lat, lng)) {
        console.warn(`[Geocoding] Ignoring ${storeName} candidate with invalid coordinates`, {
          candidateName: candidate.name,
          location: candidate.geometry?.location,
        })
        continue
      }

      const resolved: GeocodeResult = {
        lat,
        lng,
        formattedAddress: candidate.vicinity || candidate.formatted_address,
        matchedName: candidate.name,
      }
      console.log("[Geocoding] Places result selected", { storeName, keyword, resolved })
      return resolved
    }

    console.warn(`[Geocoding] No Places candidates for ${storeName} had valid coordinates`)
    return null
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

  const hintLookup = new Map<string, string | undefined>()
  if (storeHints) {
    storeHints.forEach((hint, rawName) => {
      hintLookup.set(canonicalizeStoreName(rawName), hint)
    })
  }

  const uniqueStoreEntries = new Map<string, string>()
  for (const storeName of storeNames) {
    const canonical = canonicalizeStoreName(storeName)
    if (!uniqueStoreEntries.has(canonical)) {
      uniqueStoreEntries.set(canonical, storeName)
    }
  }

  let resolvedCoordinates = userCoordinates
  if (!resolvedCoordinates && userPostalCode) {
    resolvedCoordinates = await geocodePostalCode(userPostalCode)
  }

  for (const [canonicalName, originalName] of uniqueStoreEntries.entries()) {
    let geocoded = await geocodeStore(
      originalName,
      userPostalCode,
      resolvedCoordinates ?? undefined,
      groceryDistanceMiles,
      hintLookup.get(canonicalName)
    )

    if (!geocoded) {
      console.warn(`[Geocoding] Retrying ${originalName} with relaxed constraints`)
      geocoded = await geocodeStore(
        originalName,
        userPostalCode,
        resolvedCoordinates ?? undefined,
        groceryDistanceMiles,
        hintLookup.get(canonicalName),
        { relaxed: true }
      )
    }

    if (geocoded) {
      results.set(canonicalName, geocoded)
      console.log(`[Geocoding] Successfully geocoded ${originalName}: lat=${geocoded.lat}, lng=${geocoded.lng}`)
    } else {
      console.warn(`[Geocoding] Failed to geocode ${originalName}`)
    }
  }

  console.log(
    `[Geocoding] Batch geocoding complete: ${results.size}/${uniqueStoreEntries.size} unique stores geocoded`
  )

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

export async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error("Google Maps API key not found; cannot reverse geocode coordinates")
    return null
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
    )

    if (!response.ok) {
      console.error("[Geocoding] Reverse geocode error:", response.statusText)
      return null
    }

    const data = await response.json()
    if (data.status !== "OK" || !data.results?.length) {
      console.warn("[Geocoding] No reverse geocode results for coordinates", { lat, lng })
      return null
    }

    return data.results[0].formatted_address || null
  } catch (error) {
    console.error("[Geocoding] Failed to reverse geocode coordinates", { lat, lng, error })
    return null
  }
}
