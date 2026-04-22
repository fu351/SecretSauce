import { type NextRequest, NextResponse } from "next/server"
import { ingredientsHistoryDB } from "@/lib/database/ingredients-db"

/**
 * Cache User's Manual Product Selection
 *
 * When a user manually selects a specific product from search results,
 * save that selection so future replacement/search flows return the same product.
 */
export async function POST(request: NextRequest) {
  try {
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

    if (!store || !product || (!searchTerm && !standardizedIngredientId)) {
      return NextResponse.json(
        { error: "store, product, and either searchTerm or standardizedIngredientId are required" },
        { status: 400 }
      )
    }
    if (!product.id || !product.title || typeof product.price !== "number" || product.price <= 0) {
      return NextResponse.json(
        { error: "product.id, product.title, and positive product.price are required" },
        { status: 400 }
      )
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

    console.log("[Cache Selection] Resolved standardized ID", {
      searchTerm,
      standardizedIngredientId: resolvedStandardizedIngredientId,
      store,
      productTitle: product.title,
    })

    // Preferred path: mapping-aware insert via RPC.
    // Falls back to direct insert for compatibility.
    const inserted = await ingredientsHistoryDB.batchStandardizeAndMatch([
      {
        standardizedIngredientId: resolvedStandardizedIngredientId,
        store: store.toLowerCase(),
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
        store,
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
      store,
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
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
