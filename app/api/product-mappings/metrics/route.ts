import { NextRequest, NextResponse } from "next/server"
import { productMappingsDB } from "@/lib/database/product-mappings-db"

type MetricPayload = {
  productIdsShown?: string[]
  productIdExchanged?: string | null
  zipCode?: string | null
  standardizedIngredientId?: string | null
  rawProductName?: string | null
  storeId?: string | null
}

const dedupe = (list: (string | null | undefined)[]) =>
  Array.from(new Set(list.filter((v): v is string => Boolean(v))))

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MetricPayload

    const productIdsShown = dedupe(body.productIdsShown || [])
    const productIdExchanged = body.productIdExchanged || null

    for (const pid of productIdsShown) {
      await productMappingsDB.incrementCounts({
        external_product_id: pid,
        zip_code: body.zipCode,
        standardized_ingredient_id: body.standardizedIngredientId,
        raw_product_name: body.rawProductName,
        store_id: body.storeId,
        modal_delta: 1,
      })
    }

    if (productIdExchanged) {
      await productMappingsDB.incrementCounts({
        external_product_id: productIdExchanged,
        zip_code: body.zipCode,
        standardized_ingredient_id: body.standardizedIngredientId,
        raw_product_name: body.rawProductName,
        store_id: body.storeId,
        exchange_delta: 1,
      })
    }

    return NextResponse.json({
      success: true,
      updated: productIdsShown.length + (productIdExchanged ? 1 : 0),
    })
  } catch (error: any) {
    console.error("[product-mappings/metrics] Error", error?.message || error)
    return NextResponse.json(
      { error: "Failed to update product metrics" },
      { status: 500 },
    )
  }
}
