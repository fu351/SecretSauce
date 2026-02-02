import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/database/supabase"
import { getUserPreferredStores } from "@/lib/store/user-preferred-stores"
import { buildStoreMetadataFromStoreData, type StoreMetadata } from "@/lib/utils/store-metadata"
import { normalizeZipCode } from "@/lib/utils/zip"

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
