import { type NextRequest, NextResponse } from "next/server"
import { ingredientsHistoryDB } from "@/lib/database/ingredients-db"
import { findExistingStandardizedId } from "@/lib/ingredient-pipeline"

/**
 * Cache User's Manual Product Selection
 *
 * When a user manually selects a specific product from search results,
 * save that selection to ingredients_history so future searches return the same product.
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

    // Look up standardized_ingredient_id for the search term
    const standardizedIngredientId = await findExistingStandardizedId(searchTerm)
    if (!standardizedIngredientId) {
      console.error("[Cache Selection] Failed to resolve standardized ID")
      return NextResponse.json(
        { error: "Could not resolve standardized ingredient" },
        { status: 500 }
      )
    }

    console.log("[Cache Selection] Resolved standardized ID", {
      searchTerm,
      standardizedIngredientId,
      store,
      productTitle: product.title,
    })

    // Save to ingredients_history (triggers sync to ingredients_recent)
    const cached = await ingredientsHistoryDB.insertPrice({
      standardizedIngredientId: standardizedIngredientId!,
      store: store.toLowerCase(),
      productName: product.title,
      productId: product.id,
      price: product.price,
      imageUrl: product.image_url || null,
      location: product.location || null,
    })

    if (!cached) {
      console.error("[Cache Selection] Failed to insert cache entry")
      return NextResponse.json(
        { error: "Failed to cache selection" },
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
