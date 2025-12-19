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
// In-memory cache for store locations - prevents re-geocoding same stores
const storeLocationCache = new Map<string, GeocodeResult>()
const KM_TO_MILES = 0.621371
const METERS_TO_MILES = 0.000621371
const DIACRITIC_REGEX = /[\u0300-\u036f]/g
const CURLY_APOSTROPHE_REGEX = /[\u2019\u2018]/g

/**
 * Generate cache key for store location lookup
 */
function getStoreLocationCacheKey(storeName: string, postalCode?: string): string {
  const canonical = canonicalizeStoreName(storeName)
  return postalCode ? `${canonical}:${postalCode}` : canonical
}

/**
 * Calculate Levenshtein edit distance between two strings
 * Uses optimized single-row algorithm for O(n) space complexity
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  if (a === b) return 0

  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) {
    const temp = a
    a = b
    b = temp
  }

  const aLen = a.length
  const bLen = b.length

  // Single row optimization
  const row = new Array(aLen + 1)
  for (let i = 0; i <= aLen; i++) {
    row[i] = i
  }

  for (let i = 1; i <= bLen; i++) {
    let prev = i
    for (let j = 1; j <= aLen; j++) {
      const val = b[i - 1] === a[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1
      row[j - 1] = prev
      prev = val
    }
    row[aLen] = prev
  }

  return row[aLen]
}

/**
 * Check if two strings are similar using Levenshtein distance
 * Returns true if edit distance is within acceptable threshold
 */
function isFuzzyMatch(a: string, b: string, maxDistance?: number): boolean {
  if (!a || !b) return false

  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, "")
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, "")

  if (normA === normB) return true
  if (normA.length < 3 || normB.length < 3) return false

  // Dynamic threshold: allow ~20% edit distance for longer strings
  const threshold = maxDistance ?? Math.max(1, Math.floor(Math.min(normA.length, normB.length) * 0.2))
  const distance = levenshteinDistance(normA, normB)

  return distance <= threshold
}

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
  "zip",
  "code",
  "co",
  "inc",
  "llc",
])

// Brand family mappings - parent brand to all subsidiary/regional brands
// This allows geocoding to match "Kroger" when searching for "Food Co" etc.
const BRAND_FAMILY_MAP: Record<string, string[]> = {
  kroger: [
    "kroger", "ralphs", "fredmeyer", "fred meyer", "smiths", "frys", "fry's",
    "kingsoopers", "king soopers", "marianos", "mariano's", "picknsave", "pick n save",
    "food4less", "food 4 less", "food4-less", "food 4-less", "foodsco", "foods co", "food co", "foodco",
    "citymarket", "city market",
    "dillons", "harristeeter", "harris teeter", "bakers", "gerbes", "qfc", "metro market"
  ],
  safeway: [
    "safeway", "albertsons", "vons", "pavilions", "randalls", "tom thumb",
    "jewel", "jewelosco", "jewel-osco", "acme", "shaws", "star market", "andronicos"
  ],
  target: ["target"],
  walmart: ["walmart", "neighborhood market", "sams club", "sam's club"],
  aldi: ["aldi"],
  traderjoes: ["trader joe's", "trader joes", "traderjoes"],
  wholefoods: ["whole foods", "wholefoods"],
  costco: ["costco"],
  "99ranch": ["99 ranch", "99ranch", "ranch 99", "ranch99"],
  meijer: ["meijer"],
}

// Build reverse lookup: subsidiary -> parent brand
const SUBSIDIARY_TO_PARENT: Map<string, string> = new Map()
for (const [parent, subsidiaries] of Object.entries(BRAND_FAMILY_MAP)) {
  for (const sub of subsidiaries) {
    const normalized = sub.toLowerCase().replace(/[^a-z0-9]/g, "")
    SUBSIDIARY_TO_PARENT.set(normalized, parent)
  }
}

// Get all brand family members for a given store name
function getBrandFamilyMembers(storeName: string): string[] {
  const normalized = canonicalizeStoreName(storeName)

  // Check if this is a known subsidiary
  const parent = SUBSIDIARY_TO_PARENT.get(normalized)
  if (parent && BRAND_FAMILY_MAP[parent]) {
    return BRAND_FAMILY_MAP[parent]
  }

  // Check if this matches any parent brand
  for (const [parentKey, subsidiaries] of Object.entries(BRAND_FAMILY_MAP)) {
    if (normalized.includes(parentKey) || parentKey.includes(normalized)) {
      return subsidiaries
    }
  }

  return []
}

const looksLikeFormattedAddress = (value?: string) => {
  if (!value) return false
  const normalized = value.trim()
  return /\d{3,}/.test(normalized) && /[,]/.test(normalized)
}

const createStoreSignatureMatcher = (
  storeName: string,
  storeHint?: string,
  aliasTokens?: string[]
): ((value?: string) => boolean) => {
  const normalizedTargets = new Set<string>()
  const targetSignature = canonicalizeStoreName(storeName)
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

  // Add brand family members for more lenient matching
  const familyMembers = getBrandFamilyMembers(storeName)
  for (const member of familyMembers) {
    addToken(member)
  }

  aliasTokens
    ?.filter((alias) => {
      if (!alias) return false
      const aliasSignature = canonicalizeStoreName(alias)
      if (!aliasSignature) return false
      if (!targetSignature || targetSignature.length < MIN_SIGNATURE_LENGTH) return true
      return (
        aliasSignature.includes(targetSignature) ||
        targetSignature.includes(aliasSignature)
      )
    })
    .forEach((alias) => {
      addToken(alias)
      // Also add family members for aliases
      const aliasFamily = getBrandFamilyMembers(alias)
      for (const member of aliasFamily) {
        addToken(member)
      }
    })
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

const normalizeTokens = (value?: string): string[] => {
  if (!value) return []
  return cleanStoreValue(value)
    .toLowerCase()
    .split(SPLIT_SIGNATURE_REGEX)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

const createBrandMatcher = (storeName: string, aliasTokens?: string[]): ((value?: string) => boolean) => {
  const signatures = new Set<string>()

  const addSignature = (value?: string) => {
    const sig = canonicalizeStoreName(value || "")
    if (sig && sig.length >= MIN_SIGNATURE_LENGTH) {
      signatures.add(sig)
    }
  }

  addSignature(storeName)
  aliasTokens?.forEach((alias) => addSignature(alias))

  // Add brand family members (e.g., if searching for "Kroger", also match "Food Co", "Ralphs", etc.)
  const familyMembers = getBrandFamilyMembers(storeName)
  for (const member of familyMembers) {
    addSignature(member)
  }
  // Also add family members for any aliases
  aliasTokens?.forEach((alias) => {
    const aliasFamily = getBrandFamilyMembers(alias)
    for (const member of aliasFamily) {
      addSignature(member)
    }
  })

  if (signatures.size === 0) {
    return () => false
  }

  // Build set of family signatures for fuzzy matching (reuse familyMembers from above)
  const allFamilySignatures = new Set<string>()
  for (const member of familyMembers) {
    const sig = canonicalizeStoreName(member)
    if (sig && sig.length >= MIN_SIGNATURE_LENGTH) {
      allFamilySignatures.add(sig)
    }
  }

  return (value?: string) => {
    if (!value) return false
    const tokens = normalizeTokens(value)
    if (!tokens.length) return false

    // Also check the full normalized value for multi-word matches like "trader joes"
    const fullNormalized = canonicalizeStoreName(value)

    for (const sig of signatures) {
      // Check full value first (handles "Trader Joe's" -> "traderjoes")
      if (fullNormalized === sig) return true
      if (sig.length >= 5 && fullNormalized.includes(sig)) return true
      if (fullNormalized.startsWith(sig) && fullNormalized.length - sig.length <= 4) return true

      for (const token of tokens) {
        // Exact match
        if (token === sig) return true
        // Token ends with signature (e.g., "superkroger" ends with "kroger")
        if (token.endsWith(sig) && token.length - sig.length <= 4) return true
        // Signature ends with token (e.g., "kroger" ends with "oger" - but limit to very short differences)
        if (sig.endsWith(token) && sig.length - token.length <= 2) return true
        // Token starts with signature (e.g., "krogerplus" starts with "kroger")
        if (token.startsWith(sig) && token.length - sig.length <= 4) return true
        // STRICT: Only allow contains match if the signature is long enough (>=5 chars)
        // This prevents "bowl" from matching "bowl" in "Berkeley Bowl"
        if (sig.length >= 5 && token.includes(sig)) return true
      }
    }

    // Fuzzy match against brand family members
    // This catches typos like "Krogar" -> "Kroger" or regional variants
    for (const familySig of allFamilySignatures) {
      if (familySig.length >= 4 && isFuzzyMatch(fullNormalized, familySig)) return true
      for (const token of tokens) {
        if (familySig.length >= 4 && isFuzzyMatch(token, familySig)) return true
      }
    }

    return false
  }
}

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
 * Check Supabase cache for store location
 * Cache entries expire after 1 year since stores rarely change location
 */
async function getStoreCacheFromSupabase(
  storeName: string,
  postalCode?: string
): Promise<GeocodeResult | null> {
  if (typeof window === "undefined") {
    // Skip cache on server-side
    return null
  }

  try {
    const { createBrowserClient } = await import("@/lib/supabase")
    const supabase = createBrowserClient()
    const canonical = canonicalizeStoreName(storeName)

    // Only retrieve entries created within the last year (1-year TTL)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const query = supabase
      .from("store_locations_cache")
      .select("lat, lng, formatted_address, matched_name, created_at")
      .eq("store_canonical", canonical)
      .gte("created_at", oneYearAgo.toISOString())

    if (postalCode) {
      query.eq("postal_code", postalCode)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      console.warn(`[Geocoding Cache] Supabase lookup failed for ${storeName}:`, error)
      return null
    }

    if (data) {
      console.log(`[Geocoding Cache] ✅ HIT for ${storeName} (${postalCode || "any"})`)
      return {
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formatted_address,
        matchedName: data.matched_name || undefined,
      }
    }

    return null
  } catch (error) {
    console.warn(`[Geocoding Cache] Failed to check Supabase cache:`, error)
    return null
  }
}

/**
 * Save store location to Supabase cache
 */
async function saveStoreCacheToSupabase(
  storeName: string,
  postalCode: string | undefined,
  result: GeocodeResult
): Promise<void> {
  if (typeof window === "undefined") {
    // Skip cache write on server-side
    return
  }

  try {
    const { createBrowserClient } = await import("@/lib/supabase")
    const supabase = createBrowserClient()
    const canonical = canonicalizeStoreName(storeName)

    await supabase.from("store_locations_cache").upsert(
      {
        store_canonical: canonical,
        postal_code: postalCode || "default",
        lat: result.lat,
        lng: result.lng,
        formatted_address: result.formattedAddress,
        matched_name: result.matchedName,
      },
      {
        onConflict: "store_canonical,postal_code",
      }
    )

    console.log(`[Geocoding Cache] 💾 SAVED ${storeName} (${postalCode || "default"})`)
  } catch (error) {
    console.warn(`[Geocoding Cache] Failed to save to Supabase:`, error)
  }
}

/**
 * Geocode a store name to get its latitude and longitude
 * Uses Google Geocoding API to find the closest match
 *
 * NOW WITH CACHING: Checks in-memory and Supabase cache before calling Google Maps API
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
    // CACHE LAYER 1: Check in-memory cache first (instant)
    const cacheKey = getStoreLocationCacheKey(storeName, userPostalCode)
    const memoryCache = storeLocationCache.get(cacheKey)
    if (memoryCache) {
      console.log(`[Geocoding Cache] ⚡ MEMORY HIT for ${storeName} (${userPostalCode || "any"})`)
      return memoryCache
    }

    // CACHE LAYER 2: Check Supabase cache (fast, persistent across users)
    const supabaseCache = await getStoreCacheFromSupabase(storeName, userPostalCode)
    if (supabaseCache) {
      // Warm up in-memory cache for next time
      storeLocationCache.set(cacheKey, supabaseCache)
      return supabaseCache
    }

    console.log(`[Geocoding Cache] ❌ MISS - geocoding ${storeName} (${userPostalCode || "any"})`)

    const isRelaxed = options?.relaxed ?? false
    const matchesRequestedStore = createStoreSignatureMatcher(storeName, storeHint, options?.aliasTokens)
    const brandMatcher = createBrandMatcher(storeName, options?.aliasTokens)
    const hintLooksLikeAddress = looksLikeFormattedAddress(storeHint)

    const baseRadius = Math.max(groceryDistanceMiles ?? 10, 5)
    const allowedMiles = baseRadius * (isRelaxed ? 3 : 1.5)
    const allowedDriveMiles = baseRadius * (isRelaxed ? 4 : 2)
    const strictHintLimitMiles = baseRadius * 3

    // PRIORITY 1: If we have a physical address from the scraper, use geocoding API directly
    if (storeHint && hintLooksLikeAddress) {
      console.log("[Geocoding] Attempting direct address geocoding (top priority)", {
        storeName,
        storeHint,
      })
      const hintResult = await geocodeStoreHint(
        storeName,
        storeHint,
        matchesRequestedStore,
        brandMatcher,
        userCoordinates,
        strictHintLimitMiles
      )
      if (hintResult) {
        console.log("[Geocoding] SUCCESS: Using physical address from scraper", {
          storeName,
          storeHint,
          coordinates: hintResult,
        })
        // Save to cache before returning
        storeLocationCache.set(cacheKey, hintResult)
        saveStoreCacheToSupabase(storeName, userPostalCode, hintResult).catch(console.error)
        return hintResult
      }
      console.warn("[Geocoding] Physical address geocoding failed, falling back to text-search", {
        storeName,
        storeHint,
      })
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
        matchesRequestedStore,
        brandMatcher
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
            matchesRequestedStore,
            brandMatcher
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

        const placesSignatureMatch = matchesRequestedStore(nearestStore.matchedName) || matchesRequestedStore(nearestStore.formattedAddress)
        const placesBrandMatch = brandMatcher(nearestStore.matchedName) || brandMatcher(nearestStore.formattedAddress)

        if (placesSignatureMatch || placesBrandMatch) {
          // Save to cache before returning
          storeLocationCache.set(cacheKey, nearestStore)
          saveStoreCacheToSupabase(storeName, userPostalCode, nearestStore).catch(console.error)
          return nearestStore
        } else {
          // Log but don't reject - continue to try other origins or fallback geocode
          console.log(`[Geocoding] Places result for ${storeName} didn't match brand check, trying other options`, {
            matchedName: nearestStore.matchedName,
            formattedAddress: nearestStore.formattedAddress,
            placesSignatureMatch,
            placesBrandMatch,
          })
        }
      }
    }

    console.warn(`[Geocoding] No Places candidates for ${storeName} passed validation`)
    return null
  } catch (error) {
    console.error("Geocoding error:", error)
    return null
  }
}

async function geocodeStoreHint(
  storeName: string,
  storeHint: string,
  matchesRequestedStore: (value?: string) => boolean,
  brandMatcher: (value?: string) => boolean,
  userCoordinates?: { lat: number; lng: number },
  strictRadiusMiles?: number
): Promise<GeocodeResult | null> {
  const trimmedHint = storeHint?.trim()
  if (!trimmedHint) {
    return null
  }

  try {
    // Check if the hint appears to be a full street address (contains typical address patterns)
    // Examples: "300 W State St, Ste 100, West Lafayette, IN, 47906-3539"
    //           "1032 Sagamore Pkwy W, West Lafayette, IN, 47906"
    // Must start with a street number, have at least one comma, and contain a zip code
    const isFullStreetAddress = /^\d+\s+[\w\s]+,/.test(trimmedHint) && /\d{5}/.test(trimmedHint)

    // Check if the hint is just a fallback format like "StoreName (zipCode)" or "StoreName Grocery"
    // These can be coarse, but we'll still attempt a relaxed geocode instead of skipping entirely.
    const isFallbackFormat =
      /^[\w\s']+\s*\(\d{5}\)$/.test(trimmedHint) || // StoreName (zipCode)
      /^[\w\s']+\s+(Store|Grocery|Market|Supermarket)$/i.test(trimmedHint) || // StoreName Grocery
      /^[\w\s]+,\s*[A-Z]{2}$/i.test(trimmedHint) || // City, State (no street)
      /^(Target|Walmart|Kroger|Aldi|Meijer|Safeway|Trader Joe'?s?|Whole Foods|99 Ranch)\s*(Grocery|Store|Market)?$/i.test(
        trimmedHint,
      ) // Just brand name

    const zipFromHint = trimmedHint.match(/\b\d{5}\b/)?.[0]

    // For full street addresses from scrapers, use the address directly without prepending store name
    // Otherwise, build a query that keeps the store name in front. For fallback hints, lean on the zip/city.
    const query = isFullStreetAddress
      ? trimmedHint
      : isFallbackFormat
        ? `${storeName} near ${zipFromHint ?? trimmedHint}`
        : trimmedHint.toLowerCase().includes(storeName.toLowerCase())
          ? trimmedHint
          : `${storeName} ${trimmedHint}`

    if (isFallbackFormat) {
      console.log(`[Geocoding] Hint "${trimmedHint}" is a fallback format, attempting coarse geocode for ${storeName}`, {
        query,
        zipFromHint,
      })
    }

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
      matchedName: candidate.address_components?.[0]?.long_name || candidate.formatted_address,
    }

    // Skip brand validation for full street addresses from scrapers
    // These are exact store locations from the store's own API, so we trust them
    if (!isFullStreetAddress) {
      const signatureHit =
        matchesRequestedStore(resolved.matchedName) || matchesRequestedStore(resolved.formattedAddress)
      const brandHit = brandMatcher(resolved.matchedName) || brandMatcher(resolved.formattedAddress)

      if (
        !signatureHit &&
        !brandHit &&
        !(isFallbackFormat && zipFromHint && resolved.formattedAddress?.includes(zipFromHint))
      ) {
        console.warn(`[Geocoding] Hint result for ${storeName} failed signature/brand check`, {
          storeHint,
          resolved,
          isFallbackFormat,
          zipFromHint,
        })
        return null
      }
    } else {
      console.log(`[Geocoding] Using direct street address from scraper for ${storeName}`, {
        storeHint: trimmedHint,
        resolved,
      })
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
 * This is used as a FALLBACK when no physical address is provided by the scraper
 */
async function findNearestStoreWithPlaces(
  storeName: string,
  userCoordinates: { lat: number; lng: number },
  groceryDistanceMiles: number,
  storeHint?: string,
  postalCode?: string,
  matchesRequestedStore?: (value?: string) => boolean,
  brandMatcher?: (value?: string) => boolean
): Promise<GeocodeResult | null> {
  // Build a clean search keyword - prioritize just the store name for Places API.
  // Text Search handles "Store near ZIP" more robustly than Nearby; we try Text first, then Nearby.
  // Don't add the hint if it's a generic fallback like "Aldi Grocery" - just use the store name
  const isGenericHint = storeHint && /^[\w\s']+\s*(Grocery|Store|Market|Supermarket)?$/i.test(storeHint)

  // Get brand family members for fallback searches (e.g., Kroger -> Foods Co in Bay Area)
  const familyMembers = getBrandFamilyMembers(storeName)

  // Build list of keywords to try - primary first, then regional subsidiaries
  const keywordsToTry: string[] = []
  if (isGenericHint) {
    keywordsToTry.push(storeName)
  } else {
    keywordsToTry.push(`${storeName} store`)
  }

  // Add regional subsidiary names as fallbacks (e.g., "Foods Co" for Kroger in Bay Area)
  const normalizedStore = storeName.toLowerCase().replace(/[^a-z0-9]/g, "")
  for (const member of familyMembers) {
    const normalizedMember = member.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (normalizedMember !== normalizedStore) {
      keywordsToTry.push(`${member} store`)
    }
  }

  try {
    const effectiveMiles = Math.max(groceryDistanceMiles || 10, 1)
    const radiusMeters = Math.min(effectiveMiles * 1609.34, 50000) // Places API max radius 50km

    console.log("[Geocoding] Starting Places search", {
      storeName,
      keywordsToTry,
      familyMembers,
      radiusMeters,
    })

    let candidates: GooglePlacesCandidate[] = []

    // Try each keyword until we get results (text-search only)
    for (const keyword of keywordsToTry) {
      const textQuery = postalCode ? `${keyword} near ${postalCode}` : keyword

      const textData = await callMapsProxy<GooglePlacesResponse>("place-text", {
        query: textQuery,
        location: userCoordinates,
        radius: radiusMeters,
      })

      if (textData?.status === "OK" && textData.results?.length) {
        console.log(`[Geocoding] Found ${textData.results.length} results for "${textQuery}" via Text Search`)
        candidates = textData.results
        break
      }

      console.warn(`[Geocoding] Text Search returned ${textData?.status ?? "NO_RESPONSE"} for ${textQuery}`)
    }

    if (candidates.length === 0 && postalCode) {
      console.warn(`[Geocoding] No keyword hits for ${storeName}, trying postal-only text search`, { postalCode })
      const data = await callMapsProxy<GooglePlacesResponse>("place-text", {
        query: `${storeName} near ${postalCode}`,
        location: userCoordinates,
        radius: Math.min(effectiveMiles * 1609.34 * 2, 50000),
      })
      if (data?.status === "OK" && data.results?.length) {
        candidates = data.results
      }
    }

    if (candidates.length === 0) {
      console.warn(`[Geocoding] No results found for any keyword for ${storeName}:`, keywordsToTry)
      return null
    }

    const matcher = matchesRequestedStore ?? (() => false)
    const brandCheck = brandMatcher ?? (() => false)

    // STRICT: Only use candidates that pass brand check - don't fall back to non-brand matches
    const brandCandidates = candidates.filter((candidate) => {
      const name = candidate.name
      const vicinity = candidate.vicinity
      const formatted = candidate.formatted_address
      const passes = brandCheck(name) || brandCheck(vicinity) || brandCheck(formatted)
      if (!passes && name) {
        console.log("[Geocoding] Rejecting candidate - no brand match", {
          storeName,
          candidateName: name,
          vicinity,
        })
      }
      return passes
    })

    // Only use brand-matched candidates - don't fall back to unmatched results
    const candidatePool = brandCandidates

    if (!candidatePool.length) {
      console.warn(`[Geocoding] Places search returned no usable candidates for ${storeName}`)
      return null
    }

    const sortedCandidates = candidatePool
      .map((candidate) => {
        const lat = candidate.geometry?.location?.lat
        const lng = candidate.geometry?.location?.lng
        if (typeof lat !== "number" || typeof lng !== "number") {
          console.warn("[Geocoding] Candidate missing coordinates", {
            storeName,
            candidateName: candidate.name,
            vicinity: candidate.vicinity,
          })
          return null
        }
        return {
          candidate,
          distance: calculateDistance(userCoordinates.lat, userCoordinates.lng, lat, lng),
        }
      })
      .filter((entry): entry is { candidate: GooglePlacesCandidate; distance: number } => Boolean(entry))
      .sort((a, b) => a.distance - b.distance)

    if (sortedCandidates.length === 0) {
      console.warn(`[Geocoding] No Places candidates for ${storeName} had valid coordinates`, {
        candidateNames: candidatePool.map((c) => c.name),
      })
      return null
    }

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

      console.log("[Geocoding] Evaluating Places candidate", {
        storeName,
        candidateName: candidate.name,
        distanceMiles: calculateDistance(userCoordinates.lat, userCoordinates.lng, lat, lng) * KM_TO_MILES,
        vicinity: candidate.vicinity || candidate.formatted_address,
      })

      if (
        userCoordinates &&
        calculateDistance(userCoordinates.lat, userCoordinates.lng, lat, lng) * KM_TO_MILES < 0.2 &&
        !matcher(resolved.matchedName) &&
        !brandMatcher?.(resolved.matchedName)
      ) {
        console.warn("[Geocoding] Skipping candidate located at user origin without brand match", {
          storeName,
          candidateName: candidate.name,
          formattedAddress: candidate.formatted_address,
        })
        continue
      }
      const matcherResult = matcher(resolved.matchedName) || matcher(resolved.formattedAddress)
      const brandCheckResult = brandCheck(resolved.matchedName) || brandCheck(resolved.formattedAddress)

      if (!brandCheckResult && !matcherResult) {
        console.log("[Geocoding] Candidate didn't pass brand check", {
          storeName,
          candidateName: resolved.matchedName,
          formattedAddress: resolved.formattedAddress,
          matcherResult,
          brandCheckResult,
        })
        continue
      }

      if (!brandCheckResult) {
        console.log("[Geocoding] Skipping off-brand candidate despite signature match", {
          storeName,
          candidateName: resolved.matchedName,
          formattedAddress: resolved.formattedAddress,
          matcherResult,
          brandCheckResult,
        })
        continue
      }

      // Require a brand-family alignment to accept the candidate
      console.log("[Geocoding] Places result selected", { storeName, keywords: keywordsToTry, resolved })
      return resolved
    }

    console.warn(`[Geocoding] No Places candidates for ${storeName} passed brand check`, { keywordsToTry })
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
