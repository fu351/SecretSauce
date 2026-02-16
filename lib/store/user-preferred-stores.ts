import { createServerClient } from "@/lib/database/supabase-server"
import type { Database } from "@/lib/database/supabase"
import { groceryStoresDB } from "@/lib/database/grocery-stores-db"
import { normalizeStoreName } from "@/lib/database/ingredients-db"

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export type StoreData = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  store_enum: Database["public"]["Enums"]["grocery_store"]
  grocery_store_id?: string
  storeId?: string
  latitude?: number
  longitude?: number
  distance_miles?: number
}

type StoreDataMap = Map<string, StoreData>

const STORE_PREFERRED_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const storePreferredCache = new Map<string, { expiresAt: number; value: StoreDataMap }>()
const storePreferredInflight = new Map<string, Promise<StoreDataMap>>()

function cloneStoreDataMap(source: StoreDataMap): StoreDataMap {
  return new Map(Array.from(source.entries()).map(([key, value]) => [key, { ...value }]))
}

function cleanupExpiredStorePreferredCache(now = Date.now()): void {
  for (const [key, value] of storePreferredCache.entries()) {
    if (value.expiresAt <= now) {
      storePreferredCache.delete(key)
    }
  }
}

function buildStorePreferredCacheKey(userId: string | null, fallbackZip: string): string {
  const normalizedUser = String(userId || "").trim() || "anonymous"
  const normalizedZip = String(fallbackZip || "").trim()
  return `${normalizedUser}|${normalizedZip}`
}

async function hydrateMissingStoresFromZip(
  storeMap: StoreDataMap,
  storeKeys: string[],
  fallbackZip: string
): Promise<void> {
  const missingStores = storeKeys.filter((key) => !storeMap.has(normalizeStoreName(key)))
  if (!missingStores.length || !fallbackZip) return

  console.log(`[getUserPreferredStores] Bulk lookup for ${missingStores.length} stores by zip: ${fallbackZip}`)

  try {
    // Single bulk query to get all stores for this zip code
    const allStoresInZip = await groceryStoresDB.findByZipCode(fallbackZip)

    // Build a map of store_enum -> store for quick lookup
    const storesByEnum = new Map<string, typeof allStoresInZip[0]>()
    for (const store of allStoresInZip) {
      if (!storesByEnum.has(store.store_enum)) {
        storesByEnum.set(store.store_enum, store)
      }
    }

    // Fill in missing stores from the bulk query results
    for (const storeKey of missingStores) {
      const store = storesByEnum.get(storeKey as any)
      if (store) {
        // Parse PostGIS POINT geometry to extract lat/lng
        // Format: "POINT(lng lat)" - note the order!
        let latitude: number | undefined
        let longitude: number | undefined
        if (store.geom) {
          const match = String(store.geom).match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
          if (match) {
            longitude = parseFloat(match[1])
            latitude = parseFloat(match[2])
          }
        }

        const normalizedKey = normalizeStoreName(store.store_enum)
        storeMap.set(normalizedKey, {
          id: store.id,
          name: store.name,
          address: store.address,
          city: null, // Not in current schema, would need to parse from address
          state: null,
          zip_code: store.zip_code,
          store_enum: store.store_enum,
          grocery_store_id: store.id,
          storeId: store.id,
          latitude,
          longitude,
        })
      }
    }

    console.log(
      `[getUserPreferredStores] Added ${missingStores.length} missing store(s) from zip fallback`
    )
  } catch (error) {
    console.error("[getUserPreferredStores] Failed bulk lookup by zip:", error)
  }
}

async function fetchUserPreferredStoresUncached(
  supabaseClient: ReturnType<typeof createServerClient>,
  userId: string | null
): Promise<StoreDataMap> {
  const storeMap: StoreDataMap = new Map()

  // If user is authenticated, try to get their preferred stores using RPC function
  if (userId) {
    try {
      const { data, error } = await supabaseClient.rpc("get_user_preferred_stores", {
        p_user_id: userId,
      })

      if (!error && data) {
        console.log(
          `[getUserPreferredStores] RPC returned ${data.length} stores for user ${userId}`
        )

        for (const row of data) {
          const storeKey = normalizeStoreName(row.store_brand)
          const latitude = toNullableNumber((row as any).latitude)
          const longitude = toNullableNumber((row as any).longitude)
          const distanceMiles = toNullableNumber((row as any).distance_miles)
          storeMap.set(storeKey, {
            id: row.store_id,
            name: row.store_name,
            address: row.address,
            city: null, // RPC doesn't return city separately
            state: null, // RPC doesn't return state separately
            zip_code: row.zip_code,
            store_enum: row.store_brand,
            grocery_store_id: row.grocery_store_id ?? row.store_id,
            storeId: row.store_id,
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
            distance_miles: distanceMiles ?? undefined,
          })
        }

        console.log(`[getUserPreferredStores] Found ${storeMap.size} preferred stores for user ${userId}`)
      } else if (error) {
        console.warn("[getUserPreferredStores] Error fetching preferred stores:", error)
      }
    } catch (error) {
      console.error("[getUserPreferredStores] Exception:", error)
    }
  }

  return storeMap
}

/**
 * Get user's preferred stores from database, falling back to zip-based lookup.
 *
 * This function calls the `get_user_preferred_stores` RPC which returns stores with:
 * - store_id (grocery_store_id from grocery_stores table)
 * - zip_code (store's physical location zipcode)
 * - distance_miles, latitude, longitude, and other store details
 *
 * If the RPC doesn't return enough stores, it falls back to zipcode-based lookup.
 */
export async function getUserPreferredStores(
  supabaseClient: ReturnType<typeof createServerClient>,
  userId: string | null,
  storeKeys: string[],
  fallbackZip: string
): Promise<Map<string, StoreData>> {
  cleanupExpiredStorePreferredCache()
  const cacheKey = buildStorePreferredCacheKey(userId, fallbackZip)
  const cached = storePreferredCache.get(cacheKey)
  let baseStoreMap: StoreDataMap

  if (cached) {
    baseStoreMap = cloneStoreDataMap(cached.value)
  } else {
    const inflight = storePreferredInflight.get(cacheKey)
    if (inflight) {
      baseStoreMap = cloneStoreDataMap(await inflight)
    } else {
      const promise = fetchUserPreferredStoresUncached(supabaseClient, userId)
      storePreferredInflight.set(cacheKey, promise)

      try {
        const resolved = await promise
        storePreferredCache.set(cacheKey, {
          value: cloneStoreDataMap(resolved),
          expiresAt: Date.now() + STORE_PREFERRED_CACHE_TTL_MS,
        })
        baseStoreMap = cloneStoreDataMap(resolved)
      } finally {
        storePreferredInflight.delete(cacheKey)
      }
    }
  }

  await hydrateMissingStoresFromZip(baseStoreMap, storeKeys, fallbackZip)

  const requestedMap: StoreDataMap = new Map()
  for (const storeKey of storeKeys) {
    const normalizedKey = normalizeStoreName(storeKey)
    const row = baseStoreMap.get(normalizedKey)
    if (row) {
      requestedMap.set(normalizedKey, row)
    }
  }

  return requestedMap
}
