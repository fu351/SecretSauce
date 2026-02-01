/**
 * Geocoding Adapter - Database-backed replacement for Google Maps geocoding
 *
 * This module provides the same API as lib/geocoding.ts but uses PostGIS spatial queries
 * instead of Google Maps APIs. This significantly reduces API costs and improves performance.
 *
 * Migration: Simply change imports from "@/lib/geocoding" to "@/lib/geocoding-adapter"
 */

import { groceryStoresDB, type StoreWithDistance } from "@/lib/database/grocery-stores-db"
import type { Database } from "@/lib/database/supabase"
import { createBrowserClient } from "@/lib/database/supabase"

/**
 * Result type for geocoded locations (matches original geocoding.ts)
 */
export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress?: string
  matchedName?: string
}

/**
 * Store metadata for geocoding hints
 */
export interface StoreGeocodeMetadata {
  hint?: string
  aliases?: string[]
}

/**
 * Normalize a store name to canonical form (lowercase, alphanumeric only)
 * Re-exported from original implementation for compatibility
 */
export function canonicalizeStoreName(value: string): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[\u2019\u2018]/g, "'") // Normalize apostrophes
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Map store name to enum value
 */
function storeNameToEnum(
  storeName: string
): Database["public"]["Enums"]["grocery_store"] | null {
  const canonical = canonicalizeStoreName(storeName)

  // Direct matches
  const enumMap: Record<string, Database["public"]["Enums"]["grocery_store"]> = {
    aldi: "aldi",
    kroger: "kroger",
    safeway: "safeway",
    meijer: "meijer",
    target: "target",
    traderjoes: "traderjoes",
    "99ranch": "99ranch",
    walmart: "walmart",
    wholefoods: "wholefoods",
  }

  // Try direct match first
  if (canonical in enumMap) {
    return enumMap[canonical]
  }

  // Try partial matches for common variations
  for (const [key, value] of Object.entries(enumMap)) {
    if (canonical.includes(key) || key.includes(canonical)) {
      return value
    }
  }

  return null
}

/**
 * Convert StoreWithDistance to GeocodeResult
 */
function storeToGeocodeResult(store: StoreWithDistance): GeocodeResult {
  return {
    lat: store.lat,
    lng: store.lng,
    formattedAddress: store.address || undefined,
    matchedName: store.name,
  }
}

/**
 * Get current user ID from auth session
 */
async function getCurrentUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null

  try {
    const supabase = createBrowserClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.user?.id || null
  } catch {
    return null
  }
}

/**
 * Geocode a single store by name
 * Attempts to find the closest matching store to user's location
 *
 * @param storeName - Name of the store to geocode
 * @param userPostalCode - User's postal code (optional, used if no coordinates provided)
 * @param userCoordinates - User's current coordinates (optional)
 * @param groceryDistanceMiles - Maximum search radius in miles (default: 10)
 */
export async function geocodeStore(
  storeName: string,
  userPostalCode?: string,
  userCoordinates?: { lat: number; lng: number },
  groceryDistanceMiles: number = 10
): Promise<GeocodeResult | null> {
  const storeEnum = storeNameToEnum(storeName)
  if (!storeEnum) {
    console.warn(`[Geocoding Adapter] Unknown store name: ${storeName}`)
    return null
  }

  // Strategy 1: If user is authenticated, use their profile location
  const userId = await getCurrentUserId()
  if (userId) {
    try {
      const stores = await groceryStoresDB.findStoresNearUser(userId, storeEnum, groceryDistanceMiles)
      if (stores.length > 0) {
        console.log(`[Geocoding Adapter] Found ${storeName} near user ${userId}`)
        return storeToGeocodeResult(stores[0])
      }
    } catch (error) {
      // User might not have location set, fall through to Strategy 2
      console.log(`[Geocoding Adapter] Could not use user location, falling back to coordinates`)
    }
  }

  // Strategy 2: Use provided coordinates or geocode postal code
  let coords = userCoordinates
  if (!coords && userPostalCode) {
    coords = await geocodePostalCode(userPostalCode)
  }

  if (!coords) {
    console.warn(`[Geocoding Adapter] No coordinates available for ${storeName}`)
    return null
  }

  // Find closest store using coordinates
  const store = await groceryStoresDB.findClosest(coords.lat, coords.lng, storeEnum, groceryDistanceMiles)

  if (store) {
    console.log(`[Geocoding Adapter] Found ${storeName} at ${store.distance_miles.toFixed(1)} miles`)
    return storeToGeocodeResult(store)
  }

  return null
}

/**
 * Geocode multiple stores and return their coordinates
 * Useful for batch processing store comparison results
 *
 * @param storeNames - Array of store names to geocode
 * @param userPostalCode - User's postal code (optional)
 * @param userCoordinates - User's current coordinates (optional)
 * @param groceryDistanceMiles - Maximum search radius in miles (default: 10)
 */
export async function geocodeMultipleStores(
  storeNames: string[],
  userPostalCode?: string,
  userCoordinates?: { lat: number; lng: number },
  groceryDistanceMiles: number = 10,
  storeMetadata?: Map<string, StoreGeocodeMetadata>
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>()

  console.log(`[Geocoding Adapter] Batch geocoding ${storeNames.length} stores`)

  // Convert store names to enums
  const storeEnums: Database["public"]["Enums"]["grocery_store"][] = []
  const enumToCanonical = new Map<string, string>()

  for (const storeName of storeNames) {
    const storeEnum = storeNameToEnum(storeName)
    if (storeEnum) {
      storeEnums.push(storeEnum)
      enumToCanonical.set(storeEnum, canonicalizeStoreName(storeName))
    }
  }

  // Strategy 1: If user is authenticated, use their profile location
  const userId = await getCurrentUserId()
  if (userId) {
    try {
      const stores = await groceryStoresDB.findStoresNearUser(userId, undefined, groceryDistanceMiles)

      // Map stores to results by canonical name
      for (const store of stores) {
        const canonical = enumToCanonical.get(store.store_enum)
        if (canonical) {
          results.set(canonical, storeToGeocodeResult(store))
        }
      }

      if (results.size > 0) {
        console.log(`[Geocoding Adapter] Found ${results.size} stores near user`)
        return results
      }
    } catch (error) {
      console.log(`[Geocoding Adapter] Could not use user location, falling back to coordinates`)
    }
  }

  // Strategy 2: Use provided coordinates or geocode postal code
  let coords = userCoordinates
  if (!coords && userPostalCode) {
    coords = await geocodePostalCode(userPostalCode)
  }

  if (!coords) {
    console.warn(`[Geocoding Adapter] No coordinates available for batch geocoding`)
    return results
  }

  // Find closest store for each brand
  const storeMap = await groceryStoresDB.findClosestForBrands(coords.lat, coords.lng, storeEnums, groceryDistanceMiles)

  // Convert to canonical name keys
  for (const [storeEnum, store] of storeMap.entries()) {
    const canonical = enumToCanonical.get(storeEnum)
    if (canonical) {
      results.set(canonical, storeToGeocodeResult(store))
    }
  }

  console.log(`[Geocoding Adapter] Batch geocoding complete: ${results.size}/${storeNames.length} found`)

  return results
}

/**
 * Get user's current location using browser Geolocation API
 * Re-exported from original implementation (browser API, unchanged)
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

/**
 * Geocode a postal code to get its center coordinates
 * Uses database query to find any store in that ZIP and returns its location
 * Fallback: Could use Google Geocoding API if needed
 *
 * @param postalCode - Postal/ZIP code to geocode
 */
export async function geocodePostalCode(postalCode: string): Promise<{ lat: number; lng: number } | null> {
  const normalized = postalCode?.trim()
  if (!normalized) return null

  try {
    // Find any store in this ZIP code
    const stores = await groceryStoresDB.findByZipCode(normalized)

    if (stores.length > 0) {
      // Get coordinates from first store with geom
      for (const store of stores) {
        if (store.geom) {
          // Parse POINT geometry from database
          // Format: "POINT(lng lat)" - note the order!
          const match = String(store.geom).match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
          if (match) {
            const lng = parseFloat(match[1])
            const lat = parseFloat(match[2])
            console.log(`[Geocoding Adapter] ZIP ${normalized} → ${lat}, ${lng} (from store data)`)
            return { lat, lng }
          }
        }
      }
    }

    // TODO: Fallback to Google Geocoding API if needed
    // For now, return null if no stores found in ZIP
    console.warn(`[Geocoding Adapter] No coordinates found for ZIP ${normalized}`)
    return null
  } catch (error) {
    console.error(`[Geocoding Adapter] Error geocoding ZIP ${normalized}:`, error)
    return null
  }
}
