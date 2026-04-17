import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import DeliveryManager, { type DeliveryDashboardOrder } from "./delivery-manager"
import DeliveryMap from "./delivery-map"

export const dynamic = "force-dynamic"

type DeliveryLogRow = {
  id: string
  order_id: string | null
  user_id: string
  grocery_store_id: string
  quantity_needed: number
  price_at_selection: number
  total_item_price: number | null
  week_index: number
  is_delivery_confirmed: boolean | null
  delivery_date: string | null
  created_at: string
  grocery_stores: { name: string; address: string | null } | null
  standardized_ingredients: { canonical_name: string } | null
  profiles: {
    email: string | null
    full_name: string | null
    subscription_tier: string | null
    latitude: number | null
    longitude: number | null
    formatted_address: string | null
    city: string | null
    state: string | null
    zip_code: string | null
  } | null
}

async function getDeliveryOrders(): Promise<DeliveryDashboardOrder[]> {
  const supabase = createServiceSupabaseClient()

  const { data: feeRows, error: feeError } = await supabase
    .from("delivery_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)

  if (feeError) {
    console.error("Error fetching delivery orders:", feeError)
    return []
  }

  if (!feeRows || feeRows.length === 0) {
    return []
  }

  const orderIds = feeRows.map((row) => row.id)
  const userIds = [...new Set(feeRows.map((row) => row.user_id))]

      const [{ data: logRows, error: logError }, { data: profiles, error: profileError }] =
    await Promise.all([
      supabase
        .from("store_list_history")
        .select(
          `id, order_id, user_id, grocery_store_id, quantity_needed, price_at_selection, total_item_price, week_index, is_delivery_confirmed, delivery_date, created_at, grocery_stores!inner(name, address), standardized_ingredients!inner(canonical_name)`
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, email, full_name, subscription_tier, latitude, longitude, formatted_address, city, state, zip_code")
        .in("id", userIds),
    ])

  if (logError) {
    console.error("Error fetching delivery log rows:", logError)
    return []
  }

  if (profileError) {
    console.error("Error fetching delivery profiles:", profileError)
  }

  const logsByOrderId = new Map<string, DeliveryLogRow[]>()
  for (const row of (logRows || []) as DeliveryLogRow[]) {
    if (!row.order_id) continue
    const existing = logsByOrderId.get(row.order_id) || []
    existing.push(row)
    logsByOrderId.set(row.order_id, existing)
  }

  const profileById = new Map<string, DeliveryLogRow["profiles"] & { id: string }>()
  for (const profile of profiles || []) {
    profileById.set(profile.id, profile)
  }

  return feeRows.map((feeRow) => {
    const rows = logsByOrderId.get(feeRow.id) || []
    const storesById = new Map<
      string,
      {
        storeId: string
        storeName: string
        storeAddress: string | null
        subtotal: number
        items: Array<{
          id: string
          ingredientName: string
          quantity: number
          priceAtSelection: number
          totalPrice: number
        }>
      }
    >()

    for (const row of rows) {
      const storeId = row.grocery_store_id
      const existing = storesById.get(storeId) || {
        storeId,
        storeName: row.grocery_stores?.name || "Unknown Store",
        storeAddress: row.grocery_stores?.address || null,
        subtotal: 0,
        items: [],
      }

      const totalPrice = row.total_item_price ?? row.price_at_selection * row.quantity_needed
      existing.subtotal += totalPrice
      existing.items.push({
        id: row.id,
        ingredientName: row.standardized_ingredients?.canonical_name || "Unknown Item",
        quantity: row.quantity_needed,
        priceAtSelection: row.price_at_selection,
        totalPrice,
      })
      storesById.set(storeId, existing)
    }

    const itemSubtotal = rows.reduce(
      (sum, row) => sum + (row.total_item_price ?? row.price_at_selection * row.quantity_needed),
      0
    )

    const profile = profileById.get(feeRow.user_id)
    const locationLabel =
      profile?.formatted_address ||
      [profile?.city, profile?.state].filter(Boolean).join(", ") ||
      profile?.zip_code ||
      null
    const isConfirmed =
      rows.length === 0 ? null : rows.every((row) => row.is_delivery_confirmed === true)

    return {
      id: feeRow.id,
      userId: feeRow.user_id,
      userEmail: profile?.email ?? null,
      userName: profile?.full_name ?? null,
      subscriptionTier: profile?.subscription_tier ?? feeRow.subscription_tier_at_checkout,
      userLatitude: profile?.latitude ?? null,
      userLongitude: profile?.longitude ?? null,
      locationLabel,
      createdAt: feeRow.created_at,
      updatedAt: feeRow.updated_at,
      deliveryDate: rows[0]?.delivery_date ?? null,
      weekIndex: rows[0]?.week_index ?? null,
      isConfirmed,
      itemCount: rows.length,
      itemSubtotal,
      fees: {
        subtotal: feeRow.subtotal,
        flatFee: feeRow.flat_fee,
        basketFeeRate: feeRow.basket_fee_rate,
        basketFeeAmount: feeRow.basket_fee_amount,
        totalDeliveryFee: feeRow.total_delivery_fee,
        grandTotal: feeRow.grand_total,
      },
      stores: Array.from(storesById.values()),
    } satisfies DeliveryDashboardOrder
  })
}

export default async function DeliveryDevPage() {
  await requireAdmin()
  const orders = await getDeliveryOrders()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/dev" className="text-sm text-gray-500 hover:text-gray-700">
            ← Dev Tools
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Delivery Manager</h1>
          <p className="mt-2 text-gray-600">
            Inspect delivery orders, fee breakdowns, and confirmation status.
          </p>
        </div>

        <div className="mb-8">
          <DeliveryMap orders={orders} />
        </div>

        <DeliveryManager initialOrders={orders} />
      </div>
    </div>
  )
}
