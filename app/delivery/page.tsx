"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks"
import { useDeliveryOrders, type GroupedDelivery } from "@/hooks/delivery/use-delivery-orders"

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Icons
import {
  Truck,
  Package,
  Store,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  ArrowRight,
} from "lucide-react"

export default function DeliveryPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  const { currentOrders, pastOrders, loading, refetch } = useDeliveryOrders()

  useEffect(() => setMounted(true), [])

  // Theme-aware styling (exact pattern from shopping page)
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

  return (
    <div className={`min-h-screen ${styles.bgClass} p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <Card className={`${styles.cardBgClass} mb-8`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
              <Truck className="h-6 w-6" />
              My Deliveries
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-orange-500" />
            <h3 className={`text-xl font-medium ${styles.textClass}`}>
              Loading deliveries...
            </h3>
          </div>
        )}

        {/* Tabs: Current vs Past Orders */}
        {!loading && (
          <Tabs defaultValue="current" className="w-full">
            <TabsList>
              <TabsTrigger value="current">
                Current Orders
                {currentOrders.length > 0 && (
                  <Badge className="ml-2">{currentOrders.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="past">Past Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="current">
              {currentOrders.length === 0 ? (
                <Card className={styles.cardBgClass}>
                  <CardContent className="p-12 text-center">
                    <Package className="h-16 w-16 text-gray-400 dark:text-[#e8dcc4]/40 mx-auto mb-4" />
                    <h3 className={`text-xl font-semibold mb-2 ${styles.textClass}`}>
                      No current orders
                    </h3>
                    <p className={`${styles.mutedTextClass} mb-6`}>
                      Start shopping to create your first delivery order
                    </p>
                    <Button
                      onClick={() => router.push("/shopping")}
                      className={styles.buttonClass}
                    >
                      Go to Shopping
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <OrderList
                  orders={currentOrders}
                  router={router}
                  styles={styles}
                  isPast={false}
                />
              )}
            </TabsContent>

            <TabsContent value="past">
              {pastOrders.length === 0 ? (
                <Card className={styles.cardBgClass}>
                  <CardContent className="p-12 text-center">
                    <Package className="h-16 w-16 text-gray-400 dark:text-[#e8dcc4]/40 mx-auto mb-4" />
                    <h3 className={`text-xl font-semibold mb-2 ${styles.textClass}`}>
                      No past orders
                    </h3>
                    <p className={`${styles.mutedTextClass}`}>
                      Your completed orders will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <OrderList
                  orders={pastOrders}
                  router={router}
                  styles={styles}
                  isPast={true}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

/**
 * Component for rendering list of orders
 */
interface OrderListProps {
  orders: GroupedDelivery[]
  router: ReturnType<typeof useRouter>
  styles: any
  isPast: boolean
}

function OrderList({ orders, router, styles, isPast }: OrderListProps) {
  return (
    <div className="space-y-8">
      {orders.map((delivery, index) => (
        <div key={delivery.orderId || `${delivery.deliveryDate}-${index}`} className="mb-8">
          {/* Date Header with View Details button */}
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-xl font-bold flex items-center gap-2 ${styles.textClass}`}>
              <Calendar className="h-5 w-5" />
              {delivery.deliveryDate !== "TBD"
                ? new Date(delivery.deliveryDate).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Date TBD"}
              <Badge className="ml-2">${delivery.grandTotal.toFixed(2)}</Badge>
              {delivery.isConfirmed ? (
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
            </h3>

            {/* View Details button if order has order_id */}
            {delivery.orderId && (
              <Button
                onClick={() => router.push(`/delivery/${delivery.orderId}`)}
                variant="outline"
                className={styles.buttonOutlineClass}
              >
                View Details <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Grouped by Store */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {delivery.stores.map((store) => (
              <Card key={store.storeId} className={styles.cardBgClass}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${styles.textClass} text-lg`}>
                    <Store className="h-5 w-5" />
                    {store.storeName}
                  </CardTitle>
                  {store.storeAddress && (
                    <p className={`text-sm ${styles.mutedTextClass}`}>{store.storeAddress}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {/* Item list */}
                  <div className="space-y-3">
                    {store.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className={styles.textClass}>{item.ingredientName}</p>
                          <p className={`text-sm ${styles.mutedTextClass}`}>
                            {item.quantity} × ${item.totalPrice.toFixed(2)}
                          </p>
                        </div>
                        <p className={`font-bold ${styles.textClass}`}>
                          ${(item.quantity * item.totalPrice).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Store total */}
                  <div className="border-t mt-4 pt-4 border-gray-200 dark:border-[#e8dcc4]/20">
                    <div className="flex justify-between items-center">
                      <span className={`font-bold ${styles.textClass}`}>Store Total</span>
                      <span className={`font-bold text-lg ${styles.textClass}`}>
                        ${store.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
