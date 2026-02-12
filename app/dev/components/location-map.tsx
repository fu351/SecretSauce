"use client"

import { useMemo } from "react"
import { MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet"
import type { LatLngExpression } from "leaflet"
import { Icon } from "leaflet"
import "leaflet/dist/leaflet.css"

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const DEFAULT_CENTER: LatLngExpression = [39.8283, -98.5795]

const markerIcon = new Icon({
  iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
  iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).toString(),
  shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

export interface LocationPoint {
  id: string
  label: string
  lat: number
  lng: number
  address?: string | null
  zipCode?: string | null
  storeEnum?: string | null
}

interface LocationMapProps {
  locations: LocationPoint[]
  className?: string
  height?: string
}

export default function LocationMap({ locations, className = "", height = "60vh" }: LocationMapProps) {
  const bounds = useMemo<LatLngExpression[] | null>(() => {
    if (!locations.length) return null
    return locations.map((location) => [location.lat, location.lng])
  }, [locations])

  const center: LatLngExpression = locations.length
    ? [locations[0].lat, locations[0].lng]
    : DEFAULT_CENTER

  const tooltipText = (location: LocationPoint) =>
    location.storeEnum ? `${location.storeEnum} · ${location.label}` : location.label

  return (
    <div className={`${className} overflow-hidden rounded-2xl border border-border bg-card shadow-lg`}>
      <MapContainer
        bounds={bounds ?? undefined}
        center={center}
        zoom={locations.length ? 6 : 3}
        scrollWheelZoom
        className="w-full h-full"
        style={{ height, minHeight: 420, width: "100%" }}
      >
        <TileLayer
          url={TILE_URL}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {locations.map((location) => (
          <Marker position={[location.lat, location.lng]} icon={markerIcon} key={location.id}>
            <Popup>
              <strong>{location.label}</strong>
              {location.address && <p className="text-sm">{location.address}</p>}
              <p className="text-xs text-muted-foreground">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
            </Popup>
            <Tooltip direction="top" offset={[0, -10]}>
              {tooltipText(location)}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
