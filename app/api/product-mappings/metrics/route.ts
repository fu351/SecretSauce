import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/database/supabase"

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

async function upsertAndIncrement(
  supabase: ReturnType<typeof createServerClient>,
  externalProductId: string,
  options: {
    zipCode?: string | null
    standardizedIngredientId?: string | null
    rawProductName?: string | null
    storeId?: string | null
    modalDelta?: number
    exchangeDelta?: number
  },
) {
  const payload = {
    external_product_id: externalProductId,
    zip_code: options.zipCode || null,
    store_id: options.storeId || null,
    raw_product_name: options.rawProductName || null,
    standardized_ingredient_id: options.standardizedIngredientId || null,
    last_seen_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("product_mappings")
    .upsert(payload, { onConflict: "external_product_id,store_id,zip_code" })
    .select("id, modal_opened_count, exchange_count")
    .limit(1)

  if (error) throw error
  const row = data?.[0]
  if (!row) return

  const updates: Record<string, any> = {
    last_seen_at: new Date().toISOString(),
  }

  if (options.modalDelta) {
    updates.modal_opened_count = (row.modal_opened_count ?? 0) + options.modalDelta
  }
  if (options.exchangeDelta) {
    updates.exchange_count = (row.exchange_count ?? 0) + options.exchangeDelta
  }

  const { error: updateError } = await supabase
    .from("product_mappings")
    .update(updates)
    .eq("id", row.id)

  if (updateError) throw updateError
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MetricPayload
    const supabase = createServerClient()

    const productIdsShown = dedupe(body.productIdsShown || [])
    const productIdExchanged = body.productIdExchanged || null

    for (const pid of productIdsShown) {
      await upsertAndIncrement(supabase, pid, {
        zipCode: body.zipCode,
        standardizedIngredientId: body.standardizedIngredientId,
        rawProductName: body.rawProductName,
        storeId: body.storeId,
        modalDelta: 1,
      })
    }

    if (productIdExchanged) {
      await upsertAndIncrement(supabase, productIdExchanged, {
        zipCode: body.zipCode,
        standardizedIngredientId: body.standardizedIngredientId,
        rawProductName: body.rawProductName,
        storeId: body.storeId,
        exchangeDelta: 1,
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
