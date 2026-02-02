import { createServerClient, type Database } from "@/lib/database/supabase"
import { groceryStoresDB } from "@/lib/database/grocery-stores-db"
import { normalizeStoreName } from "@/lib/database/ingredients-db"

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
  const storeMap = new Map<string, StoreData>()

  // If user is authenticated, try to get their preferred stores using RPC function
  if (userId) {
    try {
      const { data, error } = await supabaseClient.rpc("get_user_preferred_stores", {
        p_user_id: userId,
      })

      console.log(`[getUserPreferredStores] RPC returned ${data} stores for user ${userId}`)

      if (!error && data) {
        console.log(`[getUserPreferredStores] RPC data:`, data.map((r: any) => ({ store_brand: r.store_brand, zip_code: r.zip_code })))

        for (const row of data) {
          // Only include stores that are in the requested storeKeys
          if (storeKeys.includes(row.store_brand)) {
            const storeKey = normalizeStoreName(row.store_brand)
            console.log(`[getUserPreferredStores] Mapping store_brand "${row.store_brand}" -> normalized "${storeKey}"`)
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
              latitude: row.latitude,
              longitude: row.longitude,
              distance_miles: row.distance_miles,
            })
          }
        }

        console.log(`[getUserPreferredStores] Found ${storeMap.size} preferred stores for user ${userId}`)
      } else if (error) {
        console.warn("[getUserPreferredStores] Error fetching preferred stores:", error)
      }
    } catch (error) {
      console.error("[getUserPreferredStores] Exception:", error)
    }
  }

  // For any stores not found in user preferences, fall back to zip-based lookup
  const missingStores = storeKeys.filter((key) => !storeMap.has(normalizeStoreName(key)))
  if (missingStores.length > 0 && fallbackZip) {
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

      console.log(`[getUserPreferredStores] Found ${storeMap.size - (storeKeys.length - missingStores.length)} stores from bulk zip lookup`)
    } catch (error) {
      console.error(`[getUserPreferredStores] Failed bulk lookup by zip:`, error)
    }
  }

  return storeMap
}
