import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/database/supabase"
import { getUserPreferredStores } from "@/lib/store/user-preferred-stores"
import { groceryStoresDB } from "@/lib/database/grocery-stores-db"
import { buildStoreMetadataFromStoreData, type StoreMetadataMap } from "@/lib/utils/store-metadata"
import { normalizeZipCode } from "@/lib/utils/zip"
import type { Database } from "@/lib/database/supabase"

const DEFAULT_STORE_KEYS = [
  "walmart",
  "target",
  "kroger",
  "meijer",
  "99ranch",
  "traderjoes",
  "aldi",
  "andronicos",
  "wholefoods",
  "safeway",
]

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const fallbackZip = normalizeZipCode(searchParams.get('zipCode')) ?? ""

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 })
    }

    const supabaseClient = createServerClient()

    // Use the robust getUserPreferredStores function which calls the RPC
    // and has built-in fallback to zipcode-based lookup
    const storesMap = await getUserPreferredStores(
      supabaseClient,
      userId,
      DEFAULT_STORE_KEYS,
      fallbackZip
    )

    // Build metadata using shared utility
    const storeMetadata = buildStoreMetadataFromStoreData(storesMap)

    await hydrateStoreMetadataWithCachedLocations(storeMetadata, fallbackZip)

    // Serialize Map to array for JSON response
    const metadataArray = Array.from(storeMetadata.entries()).map(([key, value]) => ({
      storeName: key,
      ...value
    }))

    return NextResponse.json({ metadata: metadataArray })
  } catch (error) {
    console.error("[user-store-metadata] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch store metadata" },
      { status: 500 }
    )
  }
}

type GroceryStoreEnum = Database["public"]["Enums"]["grocery_store"]

async function hydrateStoreMetadataWithCachedLocations(
  metadata: StoreMetadataMap,
  fallbackZip: string
) {
  const tasks: Array<Promise<void>> = []

  metadata.forEach((value, key) => {
    const hasCoords = value.latitude != null && value.longitude != null
    const postalCode = value.zipCode || fallbackZip
    if (hasCoords || !postalCode) return

    tasks.push(
      (async () => {
        const stores = await groceryStoresDB.findByStoreAndZip(key as GroceryStoreEnum, postalCode)
        if (!stores.length) return

        const coord = extractCoordsFromGeom(stores[0].geom)
        if (!coord) return

        metadata.set(key, {
          ...value,
          latitude: coord.lat,
          longitude: coord.lng,
        })
        console.log(`[user-store-metadata] Hydrated ${key} coordinates from grocery_stores (${postalCode})`)
      })()
    )
  })

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
}

function extractCoordsFromGeom(geom: string | { type?: string; coordinates?: [number, number] } | null | undefined) {
  if (!geom) return null

  if (typeof geom === "string") {
    const match = geom.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
    if (match) {
      return {
        lng: parseFloat(match[1]),
        lat: parseFloat(match[2]),
      }
    }
    return null
  }

  if (typeof geom === "object" && geom?.type === "Point" && Array.isArray(geom.coordinates)) {
    return {
      lng: geom.coordinates[0],
      lat: geom.coordinates[1],
    }
  }

  return null
}
