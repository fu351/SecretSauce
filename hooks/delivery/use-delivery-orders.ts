import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/database/supabase"

export interface DeliveryOrder {
  id: string
  orderId: string | null
  storeName: string
  storeId: string
  storeAddress: string | null
  ingredientName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  deliveryDate: string | null
  isConfirmed: boolean | null
  createdAt: string
  weekIndex: number
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
  grandTotal: number
}

/**
 * Helper function to group delivery items by date and store
 */
function groupByDateAndStore(data: any[]): GroupedDelivery[] {
  if (!data || data.length === 0) return []

  // Group by order_id first, then by delivery_date if no order_id
  const orderGroups: Record<string, any[]> = {}

  data.forEach((item) => {
    // Use order_id if available, otherwise use delivery_date as fallback
    const key = item.order_id || `date_${item.delivery_date || 'unknown'}_${item.week_index}`
    if (!orderGroups[key]) {
      orderGroups[key] = []
    }
    orderGroups[key].push(item)
  })

  // Transform groups into structured format
  const grouped: GroupedDelivery[] = Object.entries(orderGroups).map(([key, items]) => {
    // Group items within this order by store
    const storeGroups: Record<string, any[]> = {}
    items.forEach((item) => {
      const storeId = item.grocery_store_id
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = []
      }
      storeGroups[storeId].push(item)
    })

    // Build store breakdown
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
        unitPrice: item.unit_price_at_selection,
        totalPrice: item.total_item_price || 0,
        deliveryDate: item.delivery_date,
        isConfirmed: item.is_delivery_confirmed,
        createdAt: item.created_at,
        weekIndex: item.week_index,
      })),
      total: storeItems.reduce((sum, item) => sum + (item.total_item_price || 0), 0),
    }))

    // Calculate grand total
    const grandTotal = stores.reduce((sum, store) => sum + store.total, 0)

    return {
      orderId: items[0].order_id,
      deliveryDate: items[0].delivery_date || "TBD",
      isConfirmed: items[0].is_delivery_confirmed,
      stores,
      grandTotal,
    }
  })

  // Sort by delivery date (most recent first)
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
      // Use Supabase JOIN query for efficiency
      const { data, error } = await supabase
        .from("store_list_history")
        .select(
          `
          *,
          grocery_stores!inner(id, name, address),
          standardized_ingredients!inner(canonical_name)
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) throw error

      // Group and separate current vs past
      const grouped = groupByDateAndStore(data || [])

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
