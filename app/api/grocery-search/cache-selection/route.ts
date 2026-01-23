import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/database/supabase"
import { resolveOrCreateStandardizedId } from "@/lib/ingredient-pipeline"

/**
 * Cache User's Manual Product Selection
 *
 * When a user manually selects a specific product from search results,
 * save that selection to ingredient_cache so future searches return the same product.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { searchTerm, store, product } = body as {
      searchTerm: string
      store: string
      product: {
        id: string
        title: string
        price: number
        unit?: string
        pricePerUnit?: string
        image_url?: string
        location?: string
      }
    }

    if (!searchTerm || !store || !product) {
      return NextResponse.json(
        { error: "searchTerm, store, and product are required" },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Get or create standardized_ingredient_id for the search term
    const standardizedIngredientId = await resolveOrCreateStandardizedId(searchTerm)

    console.log("[Cache Selection] Resolved standardized ID", {
      searchTerm,
      standardizedIngredientId,
      store,
      productTitle: product.title,
    })

    // Parse unit price if it's a string like "$2.50/lb"
    let unitPrice: number | null = null
    if (product.pricePerUnit) {
      const match = String(product.pricePerUnit).match(/[\d.]+/)
      if (match) {
        unitPrice = Number.parseFloat(match[0])
      }
    }

    // Save to ingredient_cache
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

    const cachePayload = {
      standardized_ingredient_id: standardizedIngredientId,
      store: store.toLowerCase(),
      product_name: product.title,
      product_id: product.id,
      price: product.price,
      quantity: 1,
      unit: product.unit || "unit",
      unit_price: unitPrice,
      image_url: product.image_url || null,
      location: product.location || null,
      expires_at: expiresAt,
    }

    const { error: cacheError } = await supabase
      .from("ingredient_cache")
      .upsert(cachePayload, { onConflict: "standardized_ingredient_id,store" })

    if (cacheError) {
      console.error("[Cache Selection] Failed to upsert cache", cacheError)
      return NextResponse.json(
        { error: "Failed to cache selection", details: cacheError.message },
        { status: 500 }
      )
    }

    console.log("[Cache Selection] Successfully cached user selection", {
      searchTerm,
      store,
      productTitle: product.title,
      standardizedIngredientId,
    })

    return NextResponse.json({
      success: true,
      standardizedIngredientId,
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
