import { type NextRequest, NextResponse } from "next/server"
import { ingredientsHistoryDB } from "@/lib/database/ingredients-db"
import { getAuthenticatedProfile } from "@/lib/foundation/server"

const ALLOWED_STORE_KEYS = new Set([
  "99ranch",
  "aldi",
  "andronicos",
  "kroger",
  "meijer",
  "safeway",
  "target",
  "traderjoes",
  "walmart",
  "wholefoods",
])

function normalizeStoreKey(store: string): string {
  return store.trim().toLowerCase().replace(/[\s_-]+/g, "")
}

/**
 * Cache User's Manual Product Selection
 *
 * When a user manually selects a specific product from search results,
 * save that selection so future replacement/search flows return the same product.
 */
export async function POST(request: NextRequest) {
  try {
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const body = await request.json()
    const { searchTerm, standardizedIngredientId, store, zipCode, groceryStoreId, product } = body as {
      searchTerm?: string
      standardizedIngredientId?: string | null
      store: string
      zipCode?: string | null
      groceryStoreId?: string | null
      product: {
        id: string
        title: string
        price: number
        unit?: string
        rawUnit?: string
        pricePerUnit?: string
        image_url?: string
        location?: string
      }
    }

    const normalizedStore = typeof store === "string" ? normalizeStoreKey(store) : ""
    if (!normalizedStore || !product || (!searchTerm && !standardizedIngredientId)) {
      return NextResponse.json(
        { error: "store, product, and either searchTerm or standardizedIngredientId are required" },
        { status: 400 }
      )
    }
    if (!ALLOWED_STORE_KEYS.has(normalizedStore)) {
      return NextResponse.json({ error: "Unsupported store" }, { status: 400 })
    }
    if (!product.id || !product.title || typeof product.price !== "number" || product.price <= 0) {
      return NextResponse.json(
        { error: "product.id, product.title, and positive product.price are required" },
        { status: 400 }
      )
    }
    if (product.price > 1000 || product.title.length > 300 || product.id.length > 200) {
      return NextResponse.json({ error: "Invalid product payload" }, { status: 400 })
    }

    const resolvedStandardizedIngredientId =
      standardizedIngredientId ||
      (searchTerm ? await ingredientsHistoryDB.resolveStandardizedIngredientId(searchTerm) : null)

    if (!resolvedStandardizedIngredientId) {
      console.error("[Cache Selection] Failed to resolve standardized ID")
      return NextResponse.json(
        { error: "Could not resolve standardized ingredient" },
        { status: 500 }
      )
    }

    const { data: standardizedIngredient } = await profile.supabase
      .from("standardized_ingredients")
      .select("id")
      .eq("id", resolvedStandardizedIngredientId)
      .maybeSingle()

    if (!standardizedIngredient) {
      return NextResponse.json({ error: "Invalid standardized ingredient" }, { status: 400 })
    }

    console.log("[Cache Selection] Resolved standardized ID", {
      searchTerm,
      standardizedIngredientId: resolvedStandardizedIngredientId,
      store: normalizedStore,
      productTitle: product.title,
    })

    // Preferred path: mapping-aware insert via RPC.
    // Falls back to direct insert for compatibility.
    const inserted = await ingredientsHistoryDB.batchStandardizeAndMatch([
      {
        standardizedIngredientId: resolvedStandardizedIngredientId,
        store: normalizedStore,
        price: product.price,
        productName: product.title,
        productId: product.id,
        rawUnit: product.rawUnit ?? product.unit ?? null,
        unit: product.unit ?? product.rawUnit ?? null,
        zipCode: zipCode || null,
        groceryStoreId: groceryStoreId || null,
      },
    ])

    if (inserted === 0) {
      // The RPC returned 0 rows — either it errored or all items were skipped/filtered.
      // A direct insertPrice fallback would create an ingredients_history row with no
      // product_mapping_id, which get_pricing can't use (it joins through product_mappings).
      // Return 500 so the caller knows the selection wasn't persisted.
      console.error("[Cache Selection] batchStandardizeAndMatch returned 0 — selection not cached", {
        searchTerm,
        store: normalizedStore,
        productTitle: product.title,
        standardizedIngredientId: resolvedStandardizedIngredientId,
      })
      return NextResponse.json(
        { error: "Failed to cache selection" },
        { status: 500 }
      )
    }

    console.log("[Cache Selection] Successfully cached user selection", {
      searchTerm,
      store: normalizedStore,
      productTitle: product.title,
      standardizedIngredientId: resolvedStandardizedIngredientId,
      inserted,
    })

    return NextResponse.json({
      success: true,
      standardizedIngredientId: resolvedStandardizedIngredientId,
      inserted,
      message: "Selection cached successfully"
    })
  } catch (error) {
    console.error("[Cache Selection] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
