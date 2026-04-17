"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { storeListHistoryDB } from "@/lib/database/store-list-history-db"
import { deliveryOrdersDB } from "@/lib/database/delivery-orders-db"

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

// Icons
import {
  ArrowLeft,
  Package,
  Store,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react"

interface OrderItem {
  id: string
  storeName: string
  storeAddress: string | null
  ingredientName: string
  quantity: number
  packagePrice: number
  totalPrice: number
}

interface OrderFees {
  subtotal: number
  flatFee: number
  basketFeeRate: number
  basketFeeAmount: number
  totalDeliveryFee: number
  grandTotal: number
  subscriptionTierAtCheckout: string
}

interface OrderDetail {
  orderId: string
  deliveryDate: string | null
  weekIndex: number
  isConfirmed: boolean | null
  createdAt: string | null
  stores: {
    storeId: string
    storeName: string
    storeAddress: string | null
    items: OrderItem[]
    subtotal: number
  }[]
  itemSubtotal: number
  fees: OrderFees | null
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<OrderDetail | null>(null)

  const orderId = params.id as string

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (user && orderId) {
      fetchOrderDetails()
    }
  }, [user, orderId])

  const fetchOrderDetails = async () => {
    if (!user) return

    setLoading(true)
    try {
      // Fetch all items for this order with JOINs
      const [data, feeRow] = await Promise.all([
        storeListHistoryDB.findByOrderIdWithJoins(orderId, user.id),
        deliveryOrdersDB.findById(orderId, user.id),
      ])

      if (!data || data.length === 0) {
        // Order not found or doesn't belong to user
        console.log("Order not found or access denied")
        router.push("/delivery")
        return
      }

      // Group items by store
      const storeGroups: Record<string, any[]> = {}
      data.forEach((item) => {
        const storeId = item.grocery_store_id
        if (!storeGroups[storeId]) {
          storeGroups[storeId] = []
        }
        storeGroups[storeId].push(item)
      })

      const itemSubtotal = data.reduce((sum, item) => sum + ((item.price_at_selection || 0) * item.quantity_needed), 0)

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

      // Build order detail structure
      const orderDetail: OrderDetail = {
        orderId: orderId,
        deliveryDate: data[0].delivery_date,
        weekIndex: data[0].week_index,
        isConfirmed: data[0].is_delivery_confirmed,
        createdAt: data[0].created_at,
        stores: Object.entries(storeGroups).map(([storeId, items]) => ({
          storeId,
          storeName: items[0].grocery_stores.name,
          storeAddress: items[0].grocery_stores.address,
          items: items.map((item) => ({
            id: item.id,
            storeName: item.grocery_stores.name,
            storeAddress: item.grocery_stores.address,
            ingredientName: item.standardized_ingredients.canonical_name,
            quantity: item.quantity_needed,
            packagePrice: item.price_at_selection,
            totalPrice: item.total_item_price || 0,
          })),
          subtotal: items.reduce((sum, item) => sum + ((item.price_at_selection || 0) * item.quantity_needed), 0),
        })),
        itemSubtotal,
        fees,
      }

      setOrder(orderDetail)
    } catch (err) {
      console.error("Failed to fetch order details:", err)
      router.push("/delivery")
    } finally {
      setLoading(false)
    }
  }

  // Theme-aware styling
  const isDark = (mounted ? theme : "light") === "dark"
  const styles = useMemo(
    () => ({
      bgClass: isDark ? "bg-[#181813]" : "bg-gray-50/50",
      cardBgClass: isDark ? "bg-[#1f1e1a] shadow-none" : "bg-white shadow-sm border-0",
      textClass: isDark ? "text-[#e8dcc4]" : "text-gray-900",
      mutedTextClass: isDark ? "text-[#e8dcc4]/70" : "text-gray-500",
      buttonClass: isDark
        ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] shadow-none"
        : "bg-orange-500 hover:bg-orange-600 text-white shadow-sm",
      buttonOutlineClass: isDark
        ? "border-0 bg-[#e8dcc4]/10 text-[#e8dcc4] hover:bg-[#e8dcc4]/20"
        : "border border-gray-200 bg-white hover:bg-gray-50",
    }),
    [isDark]
  )

  if (!mounted) return <div className={`min-h-screen ${styles.bgClass}`} />

  if (loading) {
    return (
      <div className={`min-h-screen ${styles.bgClass} flex items-center justify-center`}>
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-orange-500" />
          <h3 className={`text-xl font-medium ${styles.textClass}`}>
            Loading order details...
          </h3>
        </div>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className={`min-h-screen ${styles.bgClass} p-6`}>
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button
          onClick={() => router.push("/delivery")}
          variant="ghost"
          className={`mb-6 ${styles.buttonOutlineClass}`}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Button>

        {/* Order Header */}
        <Card className={`${styles.cardBgClass} mb-6`}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className={`flex items-center gap-2 ${styles.textClass} mb-2`}>
                  <Package className="h-6 w-6" />
                  Order #{order.orderId.slice(0, 8).toUpperCase()}
                </CardTitle>
                <div className="flex items-center gap-4 text-sm">
                  <div className={`flex items-center gap-1 ${styles.mutedTextClass}`}>
                    <Calendar className="h-4 w-4" />
                    {order.deliveryDate
                      ? new Date(order.deliveryDate).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "Date TBD"}
                  </div>
                  <div>
                    {order.isConfirmed ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Delivered
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm ${styles.mutedTextClass}`}>Order Total</p>
                <p className={`text-3xl font-bold ${styles.textClass}`}>
                  ${(order.fees?.grandTotal ?? order.itemSubtotal).toFixed(2)}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Items by Store */}
        <div className="space-y-6">
          {order.stores.map((store) => (
            <Card key={store.storeId} className={styles.cardBgClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
                  <Store className="h-5 w-5" />
                  {store.storeName}
                </CardTitle>
                {store.storeAddress && (
                  <p className={`flex items-center gap-1 text-sm ${styles.mutedTextClass}`}>
                    <MapPin className="h-4 w-4" />
                    {store.storeAddress}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {/* Item List */}
                <div className="space-y-4">
                  {store.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className={`font-medium ${styles.textClass}`}>{item.ingredientName}</p>
                        <p className={`text-sm ${styles.mutedTextClass}`}>
                          {item.quantity} pkg × ${item.packagePrice.toFixed(2)}
                        </p>
                      </div>
                      <p className={`font-bold ${styles.textClass}`}>
                        ${(item.quantity * item.packagePrice).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>

                <Separator className="my-4 bg-gray-200 dark:bg-[#e8dcc4]/20" />

                {/* Store Subtotal */}
                <div className="flex justify-between items-center">
                  <span className={`font-semibold ${styles.textClass}`}>Store Subtotal</span>
                  <span className={`font-bold text-lg ${styles.textClass}`}>
                    ${store.subtotal.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Fee breakdown */}
        {order.fees && (
          <Card className={`${styles.cardBgClass} mt-6`}>
            <CardHeader>
              <CardTitle className={`${styles.textClass} text-base`}>Fee Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={styles.mutedTextClass}>Items subtotal</span>
                  <span className={styles.textClass}>${order.fees.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={styles.mutedTextClass}>
                    Delivery fee ({order.fees.subscriptionTierAtCheckout === "premium" ? "Premium" : "Free"})
                  </span>
                  <span className={styles.textClass}>${order.fees.flatFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={styles.mutedTextClass}>
                    Basket fee ({(order.fees.basketFeeRate * 100).toFixed(0)}%)
                  </span>
                  <span className={styles.textClass}>${order.fees.basketFeeAmount.toFixed(2)}</span>
                </div>
                <Separator className="my-2 bg-gray-200 dark:bg-[#e8dcc4]/20" />
                <div className="flex justify-between font-bold">
                  <span className={styles.textClass}>Total</span>
                  <span className={`text-lg ${styles.textClass}`}>${order.fees.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Actions (Future: Track Order button) */}
        {!order.isConfirmed && (
          <Card className={`${styles.cardBgClass} mt-6`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-semibold ${styles.textClass}`}>Track Your Delivery</h3>
                  <p className={styles.mutedTextClass}>Order status updates will appear here</p>
                </div>
                <Button className={styles.buttonClass} disabled>
                  Track Order (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
