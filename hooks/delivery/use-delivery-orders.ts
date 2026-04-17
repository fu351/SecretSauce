import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import {
  storeListHistoryDB,
  type StoreListHistoryWithJoins,
} from "@/lib/database/store-list-history-db"
import { deliveryOrdersDB } from "@/lib/database/delivery-orders-db"
import type { Database } from "@/lib/database/supabase"

type DeliveryOrderRow = Database["public"]["Tables"]["delivery_orders"]["Row"]

export interface DeliveryOrder {
  id: string
  orderId: string | null
  storeName: string
  storeId: string
  storeAddress: string | null
  ingredientName: string
  quantity: number
  packagePrice: number
  totalPrice: number
  deliveryDate: string | null
  isConfirmed: boolean | null
  createdAt: string
  weekIndex: number
}

export interface OrderFees {
  subtotal: number
  flatFee: number
  basketFeeRate: number
  basketFeeAmount: number
  totalDeliveryFee: number
  grandTotal: number
  subscriptionTierAtCheckout: string
}

export interface GroupedDelivery {
  orderId: string | null
  deliveryDate: string
  isConfirmed: boolean | null
  stores: {
    storeId: string
    storeName: string
    storeAddress: string | null
    items: DeliveryOrder[]
    total: number
  }[]
  itemSubtotal: number
  fees: OrderFees | null
}

/**
 * Helper function to group delivery items by date and store
 */
function groupByDateAndStore(
  data: StoreListHistoryWithJoins[],
  feesByOrderId: Record<string, DeliveryOrderRow>
): GroupedDelivery[] {
  if (!data || data.length === 0) return []

  const orderGroups: Record<string, StoreListHistoryWithJoins[]> = {}

  data.forEach((item) => {
    const key = item.order_id || `date_${item.delivery_date || 'unknown'}_${item.week_index}`
    if (!orderGroups[key]) {
      orderGroups[key] = []
    }
    orderGroups[key].push(item)
  })

  const grouped: GroupedDelivery[] = Object.entries(orderGroups).map(([_, items]) => {
    const storeGroups: Record<string, StoreListHistoryWithJoins[]> = {}
    items.forEach((item) => {
      const storeId = item.grocery_store_id
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = []
      }
      storeGroups[storeId].push(item)
    })

    const stores = Object.entries(storeGroups).map(([storeId, storeItems]) => ({
      storeId,
      storeName: storeItems[0].grocery_stores?.name || "Unknown Store",
      storeAddress: storeItems[0].grocery_stores?.address || null,
      items: storeItems.map((item) => ({
        id: item.id,
        orderId: item.order_id,
        storeName: item.grocery_stores?.name || "Unknown Store",
        storeId: item.grocery_store_id,
        storeAddress: item.grocery_stores?.address || null,
        ingredientName: item.standardized_ingredients?.canonical_name || "Unknown Item",
        quantity: item.quantity_needed,
        packagePrice: item.price_at_selection,
        totalPrice: item.total_item_price || 0,
        deliveryDate: item.delivery_date,
        isConfirmed: item.is_delivery_confirmed,
        createdAt: item.created_at,
        weekIndex: item.week_index,
      })),
      total: storeItems.reduce((sum, item) => sum + ((item.price_at_selection || 0) * item.quantity_needed), 0),
    }))

    const itemSubtotal = stores.reduce((sum, store) => sum + store.total, 0)
    const orderId = items[0].order_id
    const feeRow = orderId ? feesByOrderId[orderId] : undefined

    const fees: OrderFees | null = feeRow
      ? {
          subtotal: feeRow.subtotal,
          flatFee: feeRow.flat_fee,
          basketFeeRate: feeRow.basket_fee_rate,
          basketFeeAmount: feeRow.basket_fee_amount,
          totalDeliveryFee: feeRow.total_delivery_fee,
          grandTotal: feeRow.grand_total,
          subscriptionTierAtCheckout: feeRow.subscription_tier_at_checkout,
        }
      : null

    return {
      orderId,
      deliveryDate: items[0].delivery_date || "TBD",
      isConfirmed: items[0].is_delivery_confirmed,
      stores,
      itemSubtotal,
      fees,
    }
  })

  return grouped.sort((a, b) => {
    if (a.deliveryDate === "TBD") return 1
    if (b.deliveryDate === "TBD") return -1
    return new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime()
  })
}

/**
 * Hook for fetching and managing delivery orders
 */
export function useDeliveryOrders() {
  const { user } = useAuth()
  const [currentOrders, setCurrentOrders] = useState<GroupedDelivery[]>([])
  const [pastOrders, setPastOrders] = useState<GroupedDelivery[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchOrders()
    } else {
      setLoading(false)
    }
  }, [user])

  const fetchOrders = async () => {
    if (!user) return

    setLoading(true)
    try {
      const [data, feeRows] = await Promise.all([
        storeListHistoryDB.findByUserIdWithJoins(user.id),
        deliveryOrdersDB.findByUserId(user.id),
      ])

      const feesByOrderId: Record<string, DeliveryOrderRow> = {}
      feeRows.forEach((row) => { feesByOrderId[row.id] = row })

      const grouped = groupByDateAndStore(data, feesByOrderId)

      setCurrentOrders(grouped.filter((g) => !g.isConfirmed))
      setPastOrders(grouped.filter((g) => g.isConfirmed))
    } catch (err) {
      console.error("Failed to fetch delivery orders:", err)
      setCurrentOrders([])
      setPastOrders([])
    } finally {
      setLoading(false)
    }
  }

  return {
    currentOrders,
    pastOrders,
    loading,
    refetch: fetchOrders,
  }
}
