"use client"

import "leaflet/dist/leaflet.css"
import { useMemo } from "react"
import L, { type LatLngExpression } from "leaflet"
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet"

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
import markerIcon from "leaflet/dist/images/marker-icon.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"

export type StorePoint = {
  id: string
  name: string
  storeEnum?: string | null
  address?: string | null
  zipCode?: string | null
  lat: number
  lng: number
}

interface StoreMapProps {
  points: StorePoint[]
  center: LatLngExpression
  zoom?: number
}

const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const DEFAULT_ICON = new L.Icon({
  iconUrl: markerIcon.src,
  iconRetinaUrl: markerIcon2x.src,
  shadowUrl: markerShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

export default function StorePointMap({ points, center, zoom = 5 }: StoreMapProps) {
  const bounds = useMemo(() => {
    if (points.length === 0) return undefined
    const latLngs = points.map((point) => [point.lat, point.lng] as [number, number])
    return L.latLngBounds(latLngs)
  }, [points])

  const markers = useMemo(
    () =>
      points.map((point) => ({
        id: point.id,
        position: [point.lat, point.lng] as [number, number],
        label: `${point.name}${point.zipCode ? ` (${point.zipCode})` : ""}`,
        subtitle: point.storeEnum || "Unknown brand",
        address: point.address,
      })),
    [points],
  )

  return (
    <MapContainer
      aria-label="Developer grocery store map"
      className="h-full w-full"
      center={center}
      zoom={zoom}
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom
      doubleClickZoom
      attributionControl
      zoomControl
    >
      <TileLayer url={DEFAULT_TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {markers.map((marker) => (
        <Marker position={marker.position} key={marker.id} icon={DEFAULT_ICON}>
          <Popup>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{marker.label}</p>
              <p className="text-slate-500 dark:text-slate-300">{marker.subtitle}</p>
              {marker.address && <p className="text-slate-500 dark:text-slate-300">{marker.address}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
