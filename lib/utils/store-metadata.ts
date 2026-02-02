import { normalizeStoreName } from "@/lib/database/ingredients-db"

/**
 * Store metadata containing IDs and location information
 */
export type StoreMetadata = {
  storeId?: string | null
  grocery_store_id?: string | null
  zipCode?: string | null
  latitude?: number | null
  longitude?: number | null
  distanceMiles?: number | null
}

/**
 * Map of normalized store names to their metadata
 */
export type StoreMetadataMap = Map<string, StoreMetadata>

/**
 * Builds store metadata map from user_preferred_stores table rows.
 * Used primarily in client-side contexts (hooks).
 *
 * @param rows - Array of user_preferred_stores rows with store_enum, grocery_store_id, and zip_code
 * @returns StoreMetadataMap with normalized store names as keys
 */
export function buildStoreMetadataFromRows(
  rows: Array<{
    store_enum: string
    grocery_store_id: string
    zip_code?: string | null
    latitude?: number | null
    longitude?: number | null
    distance_miles?: number | null
  }>
): StoreMetadataMap {
  const metadata = new Map<string, StoreMetadata>()

  rows.forEach(row => {
    const normalizedStore = normalizeStoreName(row.store_enum)
    metadata.set(normalizedStore, {
      storeId: row.grocery_store_id,
      grocery_store_id: row.grocery_store_id,
      zipCode: row.zip_code ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      distanceMiles: row.distance_miles ?? null,
    })
  })

  return metadata
}

/**
 * Builds store metadata map from StoreData objects (typically from getUserPreferredStores RPC).
 * Used primarily in server-side contexts (API routes).
 *
 * @param stores - Map of normalized store names to StoreData objects
 * @returns StoreMetadataMap with normalized store names as keys
 */
export function buildStoreMetadataFromStoreData(
  stores: Map<string, {
    id?: string
    storeId?: string
    grocery_store_id?: string
    zip_code?: string | null
    latitude?: number | null
    longitude?: number | null
    distance_miles?: number | null
  }>
): StoreMetadataMap {
  const metadata = new Map<string, StoreMetadata>()

  stores.forEach((store, key) => {
    metadata.set(key, {
      storeId: store.storeId ?? store.id,
      grocery_store_id: store.grocery_store_id ?? store.storeId ?? store.id,
      zipCode: store.zip_code ?? null,
      latitude: store.latitude ?? null,
      longitude: store.longitude ?? null,
      distanceMiles: store.distance_miles ?? null,
    })
  })

  return metadata
}

/**
 * NOTE: getStoreInfo was removed - use direct map lookup instead:
 *
 * const metadata = storeMetadata.get(normalizedStore)
 * const groceryStoreId = metadata?.grocery_store_id ?? null
 * const zipCode = metadata?.zipCode ?? null
 *
 * No fallback to user's zipcode - if metadata doesn't have it, use null!
 * The RPC already provides the correct store zipcodes.
 */
