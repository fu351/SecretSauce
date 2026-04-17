"use client"

import { useEffect, useMemo } from "react"
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { DeliveryDashboardOrder } from "./delivery-manager"

type DeliveryMapPoint = Pick<
  DeliveryDashboardOrder,
  | "id"
  | "userName"
  | "userEmail"
  | "locationLabel"
  | "userLatitude"
  | "userLongitude"
  | "subscriptionTier"
  | "isConfirmed"
  | "itemSubtotal"
  | "deliveryDate"
>

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Date TBD"
}

function createDotIcon(color: string) {
  return new L.DivIcon({
    className: "",
    html: `<div style="
      width: 18px;
      height: 18px;
      border-radius: 9999px;
      background: ${color};
      border: 3px solid white;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function colorForOrder(order: Pick<DeliveryDashboardOrder, "isConfirmed">) {
  if (order.isConfirmed === true) return "#16a34a"
  if (order.isConfirmed === false) return "#f59e0b"
  return "#6b7280"
}

export default function DeliveryMap({ orders }: { orders: DeliveryMapPoint[] }) {
  const points = useMemo(
    () =>
      orders
        .filter(
          (order): order is DeliveryMapPoint & {
            userLatitude: number
            userLongitude: number
          } => typeof order.userLatitude === "number" && typeof order.userLongitude === "number"
        )
        .map((order) => ({
          order,
          lat: order.userLatitude,
          lng: order.userLongitude,
        })),
    [orders]
  )

  const missingCoords = orders.length - points.length

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Delivery Map</h2>
          <p className="text-sm text-gray-600">
            Customer destinations plotted from profile coordinates
          </p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <div>{points.length} mapped</div>
          <div>{missingCoords} missing coordinates</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-[420px]">
          <MapContainer
            center={[37.7749, -122.4194]}
            zoom={10}
            scrollWheelZoom={false}
            className="h-[420px] w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBoundsController points={points} />
            {points.map(({ order, lat, lng }) => (
              <Marker key={order.id} position={[lat, lng]} icon={createDotIcon(colorForOrder(order))}>
                <Popup>
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold text-gray-900">
                      {order.userName || order.userEmail || order.id.slice(0, 8)}
                    </div>
                    <div className="text-gray-600">
                      {order.locationLabel || "No formatted address"}
                    </div>
                    <div className="text-gray-600">
                      {order.isConfirmed === true
                        ? "Delivered"
                        : order.isConfirmed === false
                          ? "Pending"
                          : "Unknown"}
                    </div>
                    <div className="text-gray-600">
                      {formatMoney(order.fees?.grandTotal ?? order.itemSubtotal)}
                    </div>
                    <div className="text-gray-600">
                      Delivery {formatDate(order.deliveryDate)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 p-4 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Map Legend
          </h3>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-green-600" />
              Delivered
            </div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              Pending
            </div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-gray-500" />
              Unknown status
            </div>
          </div>

          <div className="mt-6 space-y-2 rounded-lg bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-900">Coverage</div>
            <div className="text-sm text-gray-600">
              {points.length} of {orders.length} deliveries have lat/lng on the profile row.
            </div>
            <div className="text-sm text-gray-600">
              Missing coordinates are left out of the map and still appear in the list below.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MapBoundsController({
  points,
}: {
  points: Array<{ lat: number; lng: number }>
}) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) {
      map.setView([37.7749, -122.4194], 10)
      return
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 11)
      return
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [map, points])

  return null
}
