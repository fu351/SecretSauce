import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest) {
  await requireAdmin()
  const supabase = createServiceSupabaseClient()

  const body = await req.json()
  const orderId = String(body?.orderId || "").trim()
  const confirmed = body?.confirmed

  if (!orderId || typeof confirmed !== "boolean") {
    return NextResponse.json(
      { error: "orderId and confirmed are required" },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  const [{ error: historyError }, { error: feeError }] = await Promise.all([
    supabase
      .from("store_list_history")
      .update({ is_delivery_confirmed: confirmed, updated_at: now })
      .eq("order_id", orderId),
    supabase
      .from("delivery_orders")
      .update({ updated_at: now })
      .eq("id", orderId),
  ])

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 })
  }

  if (feeError) {
    return NextResponse.json({ error: feeError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
