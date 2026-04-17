"use client"

import { useState } from "react"
import { Store, Truck } from "lucide-react"

export interface DeliveryDashboardOrder {
  id: string
  userId: string
  userEmail: string | null
  userName: string | null
  subscriptionTier: string
  userLatitude: number | null
  userLongitude: number | null
  locationLabel: string | null
  createdAt: string
  updatedAt: string
  deliveryDate: string | null
  weekIndex: number | null
  isConfirmed: boolean | null
  itemCount: number
  itemSubtotal: number
  fees: {
    subtotal: number
    flatFee: number
    basketFeeRate: number
    basketFeeAmount: number
    totalDeliveryFee: number
    grandTotal: number
  } | null
  stores: Array<{
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
  }>
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Date TBD"
}

function statusLabel(isConfirmed: boolean | null) {
  if (isConfirmed === true) return "Delivered"
  if (isConfirmed === false) return "Pending"
  return "Unknown"
}

export default function DeliveryManager({
  initialOrders,
}: {
  initialOrders: DeliveryDashboardOrder[]
}) {
  const [orders, setOrders] = useState(initialOrders)
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function updateOrder(orderId: string, confirmed: boolean) {
    setLoadingOrderId(orderId)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch("/api/dev/deliveries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, confirmed }),
      })
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || "Failed to update delivery")
      }

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, isConfirmed: confirmed } : order
        )
      )
      setMessage(`Order ${orderId.slice(0, 8).toUpperCase()} updated.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoadingOrderId(null)
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg bg-white p-12 text-center shadow">
        <p className="text-gray-500">No delivery orders found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {(message || error) && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {error ?? message}
        </div>
      )}

      {orders.map((order) => (
        <div key={order.id} className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Order #{order.id.slice(0, 8).toUpperCase()}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    order.isConfirmed === true
                      ? "bg-green-100 text-green-700"
                      : order.isConfirmed === false
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {statusLabel(order.isConfirmed)}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {order.userName || "Unnamed user"}
                {order.userEmail ? ` · ${order.userEmail}` : ""}
              </p>
              <p className="text-sm text-gray-500">
                Created {formatDate(order.createdAt)} · Delivery{" "}
                {formatDate(order.deliveryDate)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => updateOrder(order.id, true)}
                disabled={loadingOrderId === order.id}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Mark Delivered
              </button>
              <button
                onClick={() => updateOrder(order.id, false)}
                disabled={loadingOrderId === order.id}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Mark Pending
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">Grand Total</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {formatMoney(order.fees?.grandTotal ?? order.itemSubtotal)}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">Items</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {order.itemCount}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">Tier</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {order.subscriptionTier}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">Week</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {order.weekIndex ?? "—"}
              </div>
            </div>
          </div>

          {order.fees && (
            <div className="mt-6 rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Fee Summary
              </h3>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded bg-gray-50 p-3">
                  <div className="text-gray-500">Subtotal</div>
                  <div className="font-medium text-gray-900">{formatMoney(order.fees.subtotal)}</div>
                </div>
                <div className="rounded bg-gray-50 p-3">
                  <div className="text-gray-500">Flat fee</div>
                  <div className="font-medium text-gray-900">{formatMoney(order.fees.flatFee)}</div>
                </div>
                <div className="rounded bg-gray-50 p-3">
                  <div className="text-gray-500">Basket fee</div>
                  <div className="font-medium text-gray-900">
                    {formatMoney(order.fees.basketFeeAmount)} ({(order.fees.basketFeeRate * 100).toFixed(0)}%)
                  </div>
                </div>
                <div className="rounded bg-gray-50 p-3">
                  <div className="text-gray-500">Delivery fee</div>
                  <div className="font-medium text-gray-900">{formatMoney(order.fees.totalDeliveryFee)}</div>
                </div>
              </div>
            </div>
          )}

          <details className="mt-6 rounded-lg border border-gray-200 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-gray-800">
              Order items and stores
            </summary>
            <div className="mt-4 space-y-4">
              {order.stores.map((store) => (
                <div key={store.storeId} className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-gray-500" />
                    <h4 className="font-medium text-gray-900">{store.storeName}</h4>
                  </div>
                  {store.storeAddress && (
                    <p className="mt-1 text-sm text-gray-500">{store.storeAddress}</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {store.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-4 text-sm"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{item.ingredientName}</div>
                          <div className="text-gray-500">
                            {item.quantity} pkg × {formatMoney(item.priceAtSelection)}
                          </div>
                        </div>
                        <div className="font-medium text-gray-900">
                          {formatMoney(item.totalPrice)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-gray-200 pt-3 text-sm">
                    <span className="font-medium text-gray-600">Store subtotal</span>
                    <span className="font-medium text-gray-900">{formatMoney(store.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
    </div>
  )
}
