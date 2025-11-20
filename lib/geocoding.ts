/**
 * Geocoding utility for converting store names to coordinates using Google Geocoding API
 */

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress?: string
  matchedName?: string
}

export interface StoreGeocodeMetadata {
  hint?: string
  aliases?: string[]
}

type GoogleGeocodeResult = {
  geometry: { location: { lat: number; lng: number } }
  formatted_address: string
  address_components?: Array<{ long_name: string }>
}

type GoogleGeocodeResponse = {
  status: string
  results?: GoogleGeocodeResult[]
}

type GooglePlacesCandidate = {
  name?: string
  vicinity?: string
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
}

type GooglePlacesResponse = {
  status: string
  results?: GooglePlacesCandidate[]
}

type GoogleRoutesResponse = {
  routes?: Array<{ distanceMeters?: number; duration?: string }>
}

type MapsProxyAction = "geocode" | "place-nearby" | "place-text" | "routes"

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

const MIN_SIGNATURE_LENGTH = 3
const SPLIT_SIGNATURE_REGEX = /[^a-z0-9]+/i
const STORE_SIGNATURE_STOPWORDS = new Set([
  "store",
  "stores",
  "market",
  "markets",
  "mart",
  "grocery",
  "grocer",
  "food",
  "foods",
  "zip",
  "code",
  "co",
  "inc",
  "llc",
])

const createStoreSignatureMatcher = (
  storeName: string,
  storeHint?: string,
  aliasTokens?: string[]
): ((value?: string) => boolean) => {
  const normalizedTargets = new Set<string>()
  const hasLetters = /[a-z]/i

  const addToken = (value?: string) => {
    if (!value) return
    const normalized = normalizeStoreMatchValue(value)
    if (
      normalized &&
      normalized.length >= MIN_SIGNATURE_LENGTH &&
      hasLetters.test(normalized) &&
      !STORE_SIGNATURE_STOPWORDS.has(normalized)
    ) {
      normalizedTargets.add(normalized)
    }
    value
      .split(SPLIT_SIGNATURE_REGEX)
      .map((part) => normalizeStoreMatchValue(part))
      .filter(
        (part) =>
          part &&
          part.length >= MIN_SIGNATURE_LENGTH &&
          hasLetters.test(part) &&
          !STORE_SIGNATURE_STOPWORDS.has(part)
      )
      .forEach((part) => normalizedTargets.add(part))
  }

  addToken(storeName)
  aliasTokens?.forEach((alias) => addToken(alias))
  if (storeHint) {
    storeHint.split(/[•\-|,]+/).forEach((segment) => addToken(segment))
  }

  if (normalizedTargets.size === 0) {
    return () => false
  }

  return (value?: string) => {
    const normalizedValue = normalizeStoreMatchValue(value)
    if (!normalizedValue) return false
    for (const target of normalizedTargets) {
      if (normalizedValue.includes(target) || target.includes(normalizedValue)) {
        return true
      }
    }
    return false
  }
}

const coordinatesAppearValid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)

export function canonicalizeStoreName(value: string): string {
  return cleanStoreValue(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

const getMapsProxyUrl = () => {
  if (typeof window !== "undefined") {
    return "/api/maps"
  }
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  return `${baseUrl}/api/maps`
}

async function callMapsProxy<T>(action: MapsProxyAction, params: Record<string, any>): Promise<T | null> {
  try {
    const response = await fetch(getMapsProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Geocoding] Maps proxy ${action} failed`, errorText)
      return null
    }

    return (await response.json()) as T
  } catch (error) {
    console.error(`[Geocoding] Maps proxy ${action} error`, error)
    return null
  }
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
  options?: { relaxed?: boolean; aliasTokens?: string[] }
): Promise<GeocodeResult | null> {
  try {
    const isRelaxed = options?.relaxed ?? false
    const matchesRequestedStore = createStoreSignatureMatcher(storeName, storeHint, options?.aliasTokens)

    const baseRadius = Math.max(groceryDistanceMiles ?? 10, 5)
    const allowedMiles = baseRadius * (isRelaxed ? 3 : 1.5)
    const allowedDriveMiles = baseRadius * (isRelaxed ? 4 : 2)
    const strictHintLimitMiles = baseRadius * 3

    if (storeHint) {
      const hintResult = await geocodeStoreHint(storeName, storeHint, matchesRequestedStore, userCoordinates, strictHintLimitMiles)
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
        groceryDistanceMiles,
        storeHint,
        userPostalCode,
        matchesRequestedStore
      )

      // double-check with a larger radius if nothing is found
      if (!nearestStore) {
        const expandedRadius = Math.max(groceryDistanceMiles * 2, groceryDistanceMiles + 5, 10)
        if (expandedRadius !== groceryDistanceMiles) {
          nearestStore = await findNearestStoreWithPlaces(
            storeName,
            { lat: origin.lat, lng: origin.lng },
            expandedRadius,
            storeHint,
            userPostalCode,
            matchesRequestedStore
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
          const routeCheck = await verifyRouteDistance(userCoordinates, nearestStore)
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

        if (matchesRequestedStore(nearestStore.matchedName) || matchesRequestedStore(nearestStore.formattedAddress)) {
          return nearestStore
        }
      }
    }

    // Build search query: store name + postal code for better accuracy
    const baseQuery = storeHint || storeName
    const searchQuery = userPostalCode ? `${baseQuery} ${userPostalCode}` : baseQuery
    console.log(`[Geocoding] Attempting to geocode ${storeName} with query: ${searchQuery}`)

    const data = await callMapsProxy<GoogleGeocodeResponse>("geocode", { address: searchQuery })
    if (!data) {
      console.error("Geocoding API error: empty response")
      return null
    }

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

    const primaryComponent = selectedResult.address_components?.find((component: any) => {
      const types: string[] | undefined = component?.types
      if (!types) return false
      return types.includes("establishment") || types.includes("point_of_interest")
    })

    const fallbackComponent = selectedResult.address_components?.[0]
    const candidateName = primaryComponent?.long_name || fallbackComponent?.long_name || null
    const formattedTop = selectedResult.formatted_address?.split(",")?.[0]?.trim() || undefined

    const result: GeocodeResult = {
      lat: selectedResult.geometry.location.lat,
      lng: selectedResult.geometry.location.lng,
      formattedAddress: selectedResult.formatted_address,
      matchedName: candidateName || formattedTop || undefined,
    }

    if (
      !matchesRequestedStore(result.matchedName) &&
      !matchesRequestedStore(result.formattedAddress)
    ) {
      console.warn(`[Geocoding] ${storeName} geocode result did not match requested store metadata`, {
        storeHint,
        matchedName: result.matchedName,
        formattedAddress: result.formattedAddress,
      })
      return null
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

      const routeCheck = await verifyRouteDistance(userCoordinates, result)
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
  matchesRequestedStore: (value?: string) => boolean,
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

    const data = await callMapsProxy<GoogleGeocodeResponse>("geocode", { address: query })
    if (!data) {
      console.warn(`[Geocoding] Hint geocode error for ${storeName}: empty response`)
      return null
    }

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

    if (
      !matchesRequestedStore(resolved.matchedName) &&
      !matchesRequestedStore(resolved.formattedAddress)
    ) {
      console.warn(`[Geocoding] Hint result for ${storeName} failed signature match`, {
        storeHint,
        resolved,
      })
      return null
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
  groceryDistanceMiles: number,
  storeHint?: string,
  postalCode?: string,
  matchesRequestedStore?: (value?: string) => boolean
): Promise<GeocodeResult | null> {
  const keywordParts = [storeName, storeHint, postalCode ? `zip ${postalCode}` : null].filter(Boolean)
  const keyword = keywordParts.length > 0 ? keywordParts.join(" ") : `${storeName} store`
  try {
    const effectiveMiles = Math.max(groceryDistanceMiles || 10, 1)
    const radiusMeters = Math.min(effectiveMiles * 1609.34, 50000) // Places API max radius 50km

    console.log("[Geocoding] Nearby search request", {
      storeName,
      keyword,
      userCoordinates,
      radiusMeters,
    })

    let data = await callMapsProxy<GooglePlacesResponse>("place-nearby", {
      location: userCoordinates,
      radius: radiusMeters,
      keyword,
      type: "store",
    })

    let candidates: GooglePlacesCandidate[] = []
    if (data?.status === "OK" && data.results?.length) {
      candidates = data.results
    } else {
      console.warn(`[Geocoding] Nearby search returned ${data?.status ?? "NO_RESPONSE"} for ${storeName}, falling back to Text Search`)
      data = await callMapsProxy<GooglePlacesResponse>("place-text", {
        query: keyword,
        location: userCoordinates,
        radius: radiusMeters,
      })
      if (!data || data.status !== "OK" || !data.results?.length) {
        console.warn(`[Geocoding] Places Text Search returned ${data?.status ?? "NO_RESPONSE"} for ${storeName}`)
        return null
      }
      candidates = data.results
    }

    const matcher = matchesRequestedStore ?? (() => false)

    const preferredCandidates = candidates.filter(
      (candidate) => matcher(candidate.name) || matcher(candidate.vicinity) || matcher(candidate.formatted_address)
    )
    const candidatePool = preferredCandidates.length > 0 ? preferredCandidates : candidates

    if (!candidatePool.length) {
      console.warn(`[Geocoding] Places search returned no usable candidates for ${storeName}`)
      return null
    }

    const sortedCandidates = candidatePool
      .map((candidate) => {
        const lat = candidate.geometry?.location?.lat
        const lng = candidate.geometry?.location?.lng
        if (typeof lat !== "number" || typeof lng !== "number") {
          return null
        }
        return {
          candidate,
          distance: calculateDistance(userCoordinates.lat, userCoordinates.lng, lat, lng),
        }
      })
      .filter((entry): entry is { candidate: GooglePlacesCandidate; distance: number } => Boolean(entry))
      .sort((a, b) => a.distance - b.distance)

    for (const entry of sortedCandidates) {
      const candidate = entry.candidate
      const lat = candidate.geometry?.location?.lat
      const lng = candidate.geometry?.location?.lng
      if (typeof lat !== "number" || typeof lng !== "number" || !coordinatesAppearValid(lat, lng)) {
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
      if (
        matcher(resolved.matchedName) ||
        matcher(resolved.formattedAddress)
      ) {
        console.log("[Geocoding] Places result selected", { storeName, keyword, resolved })
        return resolved
      }
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
  destination: GeocodeResult
): Promise<{ ok: boolean; distanceMiles?: number; duration?: string }> {
  try {
    const data = await callMapsProxy<GoogleRoutesResponse>("routes", {
      origin,
      destination,
      travelMode: "DRIVE",
    })

    if (!data) {
      console.warn("[Geocoding] Routes API error via proxy")
      return { ok: false }
    }

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
  storeMetadata?: Map<string, StoreGeocodeMetadata>
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>()

  console.log(`[Geocoding] Starting batch geocoding for ${storeNames.length} stores:`, storeNames)

  const metadataLookup = new Map<string, StoreGeocodeMetadata>()
  if (storeMetadata) {
    storeMetadata.forEach((meta, rawName) => {
      const canonical = canonicalizeStoreName(rawName)
      const existing = metadataLookup.get(canonical)
      if (!existing) {
        metadataLookup.set(canonical, {
          hint: meta?.hint,
          aliases: meta?.aliases ? Array.from(new Set(meta.aliases)) : undefined,
        })
      } else {
        if (!existing.hint && meta?.hint) {
          existing.hint = meta.hint
        }
        if (meta?.aliases?.length) {
          existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...meta.aliases]))
        }
      }
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
    const postalCoords = await geocodePostalCode(userPostalCode)
    if (postalCoords) {
      resolvedCoordinates = postalCoords
    }
  }

  for (const [canonicalName, originalName] of uniqueStoreEntries.entries()) {
    const metadata = metadataLookup.get(canonicalName)
    let geocoded = await geocodeStore(
      originalName,
      userPostalCode,
      resolvedCoordinates ?? undefined,
      groceryDistanceMiles,
      metadata?.hint,
      { aliasTokens: metadata?.aliases }
    )

    if (!geocoded) {
      console.warn(`[Geocoding] Retrying ${originalName} with relaxed constraints`)
      geocoded = await geocodeStore(
        originalName,
        userPostalCode,
        resolvedCoordinates ?? undefined,
        groceryDistanceMiles,
        metadata?.hint,
        { relaxed: true, aliasTokens: metadata?.aliases }
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

  try {
    const data = await callMapsProxy<GoogleGeocodeResponse>("geocode", { address: normalized })
    if (!data) {
      console.error(`[Geocoding] Postal code geocode error (${normalized}): empty response`)
      return null
    }

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
  try {
    const data = await callMapsProxy<GoogleGeocodeResponse>("geocode", { latlng: `${lat},${lng}` })
    if (!data) {
      console.error("[Geocoding] Reverse geocode error: empty response")
      return null
    }

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
