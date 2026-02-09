"use client"

/**
 * Store Map Component with Leaflet
 * Displays an interactive map with:
 * - User's current location marker
 * - Store comparison result markers with price and name
 * - OSRM routing for travel times and directions
 * - Click handlers to sync with carousel
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "@/contexts/theme-context"
import { geocodePostalCode, getUserLocation } from "@/lib/geocoding-adapter"
import { RoutingControl } from "@/components/map/leaflet/leaflet-routing-control"
import type { RouteResult, TravelMode, LatLng } from "@/lib/routing/types"
import { Loader2, MapPin, AlertCircle, Navigation, Footprints, Car, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

// Fix Leaflet icon paths (required for Next.js)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

interface StoreComparison {
  store: string
  items: any[]
  total: number
  savings: number
  outOfRadius?: boolean
  distanceMiles?: number
  locationHint?: string
  providerAliases?: string[]
  canonicalKey?: string
  latitude?: number
  longitude?: number
}

interface StoreMapProps {
  comparisons: StoreComparison[]
  onStoreSelected?: (storeIndex: number) => void
  userPostalCode?: string
  selectedStoreIndex?: number
  maxDistanceMiles?: number
}

// Helper component to control map view
function MapViewController({
  center,
  zoom,
  bounds,
}: {
  center?: L.LatLngExpression
  zoom?: number
  bounds?: L.LatLngBounds
}) {
  const map = useMap()

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] })
    } else if (center) {
      map.setView(center, zoom ?? 12)
    }
  }, [map, center, zoom, bounds])

  return null
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Generate a small offset around an origin so we can place markers even when
 * we don't have precise coordinates. Keeps stores visible on the map.
 */
function jitterLocation(origin: LatLng, index: number): LatLng {
  const angle = (index * 137.508) % 360 // golden angle spread
  const radians = (angle * Math.PI) / 180
  const radiusMiles = 0.2 + ((index % 5) * 0.05) // 0.2–0.4 miles
  const milesToLat = radiusMiles / 69
  const milesToLng = radiusMiles / (69 * Math.cos((origin.lat * Math.PI) / 180))

  return {
    lat: origin.lat + milesToLat * Math.sin(radians),
    lng: origin.lng + milesToLng * Math.cos(radians),
  }
}

/**
 * Store Map Component
 */
export function StoreMap({
  comparisons,
  onStoreSelected,
  userPostalCode,
  selectedStoreIndex,
  maxDistanceMiles,
}: StoreMapProps) {
  const { theme } = useTheme()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [storeLocations, setStoreLocations] = useState<Map<number, LatLng>>(new Map())
  const [storeResolvedNames, setStoreResolvedNames] = useState<Map<number, string>>(new Map())
  const [customAddress, setCustomAddress] = useState("")
  const [geocodingAddress, setGeocodingAddress] = useState(false)
  const [travelMode, setTravelMode] = useState<TravelMode>("driving")
  const [showRoutes, setShowRoutes] = useState(false)
  const [routes, setRoutes] = useState<Map<number, RouteResult>>(new Map())
  const [skippedStores, setSkippedStores] = useState<string[]>([])
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null)

  const isDark = theme === "dark"
  const radiusLimitMiles = maxDistanceMiles ? maxDistanceMiles * 3 : null

  // Custom marker icons
  const blueIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    []
  )

  const redIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    []
  )

  const userIcon = useMemo(
    () =>
      new L.DivIcon({
        className: "custom-user-marker",
        html: `<div style="
          width: 16px;
          height: 16px;
          background-color: #3b82f6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    []
  )

  // Memoize routing destinations so RoutingControl doesn't rerun on every local state change
  const routingDestinations = useMemo(
    () =>
      Array.from(storeLocations.entries()).map(([index, latLng]) => ({
        index,
        latLng,
        name: comparisons[index]?.store || `Store ${index}`,
      })),
    [storeLocations, comparisons]
  )

  // Initialize user location and store geocoding
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Get user location
        let userCoords: LatLng | null = null

        // Try browser geolocation first
        const browserLocation = await getUserLocation()
        if (browserLocation) {
          userCoords = browserLocation
          console.log("[StoreMap] Got user location from browser geolocation", userCoords)
        } else if (userPostalCode) {
          // Fallback to postal code
          const postalCoords = await geocodePostalCode(userPostalCode)
          if (postalCoords) {
            userCoords = postalCoords
            console.log("[StoreMap] Got user location from postal code", userCoords)
          }
        }

        if (!userCoords) {
          // Default to San Francisco if no location available
          userCoords = { lat: 37.7749, lng: -122.4194 }
          console.warn("[StoreMap] Using default location (San Francisco)")
        }

        setUserLocation(userCoords)

        const locations = new Map<number, LatLng>()
        const names = new Map<number, string>()
        const skipped: string[] = []
        const fallbackPlaced: string[] = []
        const missingDbCoords: string[] = []

        comparisons.forEach((comparison, index) => {
          // Prefer coordinates from database (via API)
          if (comparison.latitude && comparison.longitude) {
            locations.set(index, { lat: comparison.latitude, lng: comparison.longitude })
            console.log(`[StoreMap] Using database coordinates for ${comparison.store}`)

            // Update comparison distance if not already set
            if (!comparison.distanceMiles && userCoords) {
              const distance = calculateDistance(userCoords.lat, userCoords.lng, comparison.latitude, comparison.longitude)
              comparison.distanceMiles = distance
            }
          } else {
            missingDbCoords.push(comparison.store)
            // No geocoding allowed; optionally place near user to keep visible
            if (userCoords) {
              const jittered = jitterLocation(userCoords, index)
              locations.set(index, jittered)
              fallbackPlaced.push(comparison.store)
              if (!comparison.distanceMiles) {
                comparison.distanceMiles = calculateDistance(userCoords.lat, userCoords.lng, jittered.lat, jittered.lng)
              }
              console.warn(`[StoreMap] Missing DB coordinates; approximating near user for ${comparison.store}`)
            } else {
              skipped.push(comparison.store)
              console.warn(`[StoreMap] Missing DB coordinates and no user location for ${comparison.store}`)
            }
          }
        })

        setStoreLocations(locations)
        setStoreResolvedNames(names)
        setSkippedStores(skipped)

        if (missingDbCoords.length > 0) {
          console.warn("[StoreMap] Stores missing DB coordinates (no geocoding)", missingDbCoords)
        }
        if (fallbackPlaced.length > 0) {
          console.warn(`[StoreMap] Placed ${fallbackPlaced.length} store(s) at approximate user location`, fallbackPlaced)
        }
        if (skipped.length > 0) {
          console.warn("[StoreMap] Stores still without coordinates after all fallbacks", skipped)
        }

        // Calculate map bounds to fit all markers
        if (userCoords && locations.size > 0) {
          const bounds = L.latLngBounds([userCoords.lat, userCoords.lng])
          locations.forEach((loc) => {
            bounds.extend([loc.lat, loc.lng])
          })
          setMapBounds(bounds)
        }

        setIsLoading(false)
      } catch (err) {
        console.error("[StoreMap] Initialization error:", err)
        setError("Failed to load map. Please try again.")
        setIsLoading(false)
      }
    }

    initialize()
  }, [comparisons, userPostalCode, maxDistanceMiles])

  // Geocode custom address and update user location
  const handleAddressSearch = useCallback(async () => {
    if (!customAddress.trim()) return

    setGeocodingAddress(true)
    try {
      const coords = await geocodePostalCode(customAddress)
      if (coords) {
        setUserLocation(coords)
        setError(null)
        console.log("[StoreMap] Updated user location from custom address", { coordinates: coords, address: customAddress })

        // Recalculate distances
        storeLocations.forEach((loc, index) => {
          const distance = calculateDistance(coords.lat, coords.lng, loc.lat, loc.lng)
          if (comparisons[index]) {
            comparisons[index].distanceMiles = distance
          }
        })

        // Clear routes to force recalculation
        setRoutes(new Map())
        if (showRoutes) {
          setShowRoutes(false)
        }
      } else {
        setError("Address not found. Please try a different address.")
      }
    } catch (err) {
      console.error("[StoreMap] Address geocoding error:", err)
      setError("Failed to search address. Please try again.")
    } finally {
      setGeocodingAddress(false)
    }
  }, [customAddress, storeLocations, comparisons, showRoutes])

  // Build popup content for store markers
  const buildPopupContent = useCallback(
    (comparison: StoreComparison, storeIndex: number) => {
      const bgColor = isDark ? "#1f1e1a" : "#ffffff"
      const textColor = isDark ? "#f5f2e9" : "#1f2937"
      const mutedColor = isDark ? "#c8c3b5" : "#4b5563"
      const extraCostColor = comparison.savings > 0 ? (isDark ? "#f87171" : "#dc2626") : isDark ? "#4ade80" : "#15803d"

      const travelTime = routes.get(storeIndex)?.durationText
      const resolvedName = storeResolvedNames.get(storeIndex)
      const brandName = comparison.store?.trim() ?? ""
      const requestedAlias = comparison.providerAliases?.[0]?.trim() || brandName
      const displayName = resolvedName || requestedAlias || brandName || "Store"
      const distanceMiles = toNumberOrNull(comparison.distanceMiles)

      return `
        <div style="min-width:220px;background:${bgColor};color:${textColor};padding:12px;border-radius:12px;font-family:'Inter',system-ui,sans-serif;">
          <div style="font-size:15px;font-weight:600;">${displayName}</div>
          ${
            resolvedName && resolvedName !== requestedAlias
              ? `<div style="margin-top:4px;font-size:12px;color:${mutedColor};">Found: ${resolvedName}</div>`
              : ""
          }
          <div style="margin-top:6px;font-size:14px;">Total: <strong>$${comparison.total.toFixed(2)}</strong></div>
          ${
            comparison.savings > 0
              ? `<div style="font-size:13px;color:${extraCostColor};margin-top:2px;">+$${comparison.savings.toFixed(2)} vs best</div>`
              : `<div style="font-size:13px;color:${extraCostColor};margin-top:2px;">Best price!</div>`
          }
          ${
            distanceMiles !== null
              ? `<div style="margin-top:6px;font-size:13px;color:${mutedColor};">Distance: ${distanceMiles.toFixed(1)} mi</div>`
              : ""
          }
          ${
            travelTime
              ? `<div style="margin-top:4px;font-size:13px;color:${mutedColor};">Est. ${travelMode === "walking" ? "walk" : "drive"}: ${travelTime}</div>`
              : ""
          }
        </div>
      `
    },
    [isDark, travelMode, routes, storeResolvedNames]
  )

  // Handle routes calculated
  const handleRoutesCalculated = useCallback((calculatedRoutes: Map<number, RouteResult>) => {
    setRoutes(calculatedRoutes)
    console.log(`[StoreMap] ${calculatedRoutes.size} routes calculated`)
  }, [])

  // Handle travel mode change
  const handleTravelModeChange = useCallback((mode: TravelMode) => {
    setTravelMode(mode)
    // Clear routes to force recalculation with new mode
    setRoutes(new Map())
  }, [])

  // Handle routing error
  const handleRoutingError = useCallback((err: Error) => {
    console.error("[StoreMap] Routing error:", err)
    setError(`Routing failed: ${err.message}. Please try again.`)
  }, [])

  if (!comparisons || comparisons.length === 0) {
    return (
      <div
        className={clsx(
          "w-full h-96 rounded-lg border flex items-center justify-center",
          isDark ? "bg-[#181813] border-[#e8dcc4]/30" : "bg-gray-50 border-gray-200"
        )}
      >
        <p className={clsx("text-sm", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}>No store comparisons yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          className={clsx(
            "flex items-center gap-2 p-3 rounded-lg border",
            isDark ? "bg-red-900/20 border-red-600/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"
          )}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {isLoading && (
        <div
          className={clsx(
            "flex items-center justify-center h-96 rounded-lg border",
            isDark ? "bg-[#181813] border-[#e8dcc4]/30" : "bg-orange-50 border-orange-200"
          )}
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className={clsx("w-6 h-6 animate-spin", isDark ? "text-[#e8dcc4]" : "text-orange-600")} />
            <p className={clsx("text-sm", isDark ? "text-[#e8dcc4]/60" : "text-orange-600")}>Loading map...</p>
          </div>
        </div>
      )}

      {/* Address Search Bar */}
      {!isLoading && !error && (
        <div
          className={clsx(
            "flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border",
            isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-orange-50/50 border-orange-200/50"
          )}
        >
          <div className="flex items-center gap-2 flex-1">
            <Search className={clsx("w-4 h-4 flex-shrink-0", isDark ? "text-[#e8dcc4]/60" : "text-orange-600/60")} />
            <Input
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
              placeholder="Enter your address to update location..."
              disabled={geocodingAddress}
              className={clsx(
                "flex-1",
                isDark
                  ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40"
                  : "bg-white border-orange-200 placeholder:text-gray-400"
              )}
            />
            <Button
              onClick={handleAddressSearch}
              disabled={!customAddress.trim() || geocodingAddress}
              size="sm"
              className={clsx(
                "flex-shrink-0",
                isDark
                  ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              )}
            >
              {geocodingAddress ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
      )}

      {/* Route Controls */}
      {!isLoading && !error && (
        <div
          className={clsx(
            "flex flex-col sm:flex-row items-center gap-3 p-3 rounded-lg border",
            isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-orange-50/50 border-orange-200/50"
          )}
        >
          <button
            onClick={() => setShowRoutes(!showRoutes)}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              showRoutes
                ? isDark
                  ? "bg-[#e8dcc4]/20 text-[#e8dcc4]"
                  : "bg-orange-200 text-orange-700"
                : isDark
                  ? "bg-[#e8dcc4]/10 text-[#e8dcc4]/70 hover:bg-[#e8dcc4]/20"
                  : "bg-orange-100/50 text-orange-600 hover:bg-orange-200/50"
            )}
          >
            <Navigation className="w-4 h-4" />
            {showRoutes ? "Hide Routes" : "Show Routes"}
          </button>

          {showRoutes && (
            <>
              <button
                onClick={() => handleTravelModeChange("walking")}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  travelMode === "walking"
                    ? isDark
                      ? "bg-[#e8dcc4]/20 text-[#e8dcc4]"
                      : "bg-orange-200 text-orange-700"
                    : isDark
                      ? "bg-[#e8dcc4]/10 text-[#e8dcc4]/70 hover:bg-[#e8dcc4]/20"
                      : "bg-orange-100/50 text-orange-600 hover:bg-orange-200/50"
                )}
              >
                <Footprints className="w-4 h-4" />
                Walk
              </button>

              <button
                onClick={() => handleTravelModeChange("driving")}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  travelMode === "driving"
                    ? isDark
                      ? "bg-[#e8dcc4]/20 text-[#e8dcc4]"
                      : "bg-orange-200 text-orange-700"
                    : isDark
                      ? "bg-[#e8dcc4]/10 text-[#e8dcc4]/70 hover:bg-[#e8dcc4]/20"
                      : "bg-orange-100/50 text-orange-600 hover:bg-orange-200/50"
                )}
              >
                <Car className="w-4 h-4" />
                Drive
              </button>
            </>
          )}
        </div>
      )}

      {/* Map Container */}
      {!isLoading && userLocation && (
        <div
          className={clsx("w-full rounded-lg border overflow-hidden", isDark ? "border-[#e8dcc4]/30" : "border-orange-200")}
          style={{ height: "500px" }}
        >
          <MapContainer
            center={[userLocation.lat, userLocation.lng]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
          >
            {/* Tile Layer */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={
                isDark
                  ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />

            {/* Map View Controller */}
            <MapViewController center={userLocation ? [userLocation.lat, userLocation.lng] : undefined} bounds={mapBounds ?? undefined} />

            {/* User Location Marker */}
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
              <Popup>
                <div style={{ padding: "4px" }}>
                  <strong>Your Location</strong>
                </div>
              </Popup>
            </Marker>

            {/* Store Markers */}
            {Array.from(storeLocations.entries()).map(([index, location]) => {
              const comparison = comparisons[index]
              const isSelected = index === selectedStoreIndex
              const icon = isSelected ? redIcon : blueIcon

              return (
                <Marker
                  key={index}
                  position={[location.lat, location.lng]}
                  icon={icon}
                  eventHandlers={{
                    click: () => {
                      if (onStoreSelected) {
                        onStoreSelected(index)
                      }
                    },
                  }}
                >
                  <Popup>
                    <div dangerouslySetInnerHTML={{ __html: buildPopupContent(comparison, index) }} />
                  </Popup>
                </Marker>
              )
            })}

            {/* Routing Control */}
            {showRoutes && userLocation && storeLocations.size > 0 && (
              <RoutingControl
                origin={userLocation}
                destinations={routingDestinations}
                mode={travelMode}
                showRoutes={showRoutes}
                selectedIndex={selectedStoreIndex}
                onRoutesCalculated={handleRoutesCalculated}
                onError={handleRoutingError}
              />
            )}
          </MapContainer>
        </div>
      )}

      {/* Skipped Stores Warning */}
      {!isLoading && skippedStores.length > 0 && (
        <div
          className={clsx(
            "text-xs rounded-lg border p-3",
            isDark
              ? "bg-[#181813] border-[#e8dcc4]/20 text-[#e8dcc4]/70"
              : "bg-orange-50/60 border-orange-200/70 text-orange-800"
          )}
        >
          <p className="font-medium mb-1">Couldn&apos;t map these stores:</p>
          <ul className="list-disc list-inside space-y-1">
            {skippedStores.map((store) => (
              <li key={store}>{store}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Travel Times Display */}
      {showRoutes && routes.size > 0 && (
        <div
          className={clsx(
            "p-3 rounded-lg border",
            isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-orange-50/50 border-orange-200/50"
          )}
        >
          <h3 className={clsx("text-sm font-semibold mb-2", isDark ? "text-[#e8dcc4]" : "text-orange-700")}>
            Estimated Travel Times ({travelMode === "walking" ? "Walking" : "Driving"})
          </h3>
          <div className="space-y-1 text-xs">
            {Array.from(routes.entries()).map(([storeIndex, route]) => (
              <div
                key={storeIndex}
                className={clsx(
                  "flex justify-between items-center p-2 rounded",
                  isDark ? "bg-[#0a0a0a] text-[#e8dcc4]" : "bg-white text-orange-700"
                )}
              >
                <span className="font-medium">{comparisons[storeIndex]?.store || "Store"}</span>
                <span>{route.durationText}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        className={clsx(
          "flex items-center gap-4 text-xs p-2 rounded-lg",
          isDark ? "bg-[#181813] border border-[#e8dcc4]/20" : "bg-orange-50/50 border border-orange-200/50"
        )}
      >
        <div className="flex items-center gap-2">
          <MapPin className={clsx("w-4 h-4 fill-current", isDark ? "text-[#e8dcc4]" : "text-orange-600")} />
          <span className={isDark ? "text-[#e8dcc4]/60" : "text-orange-700/70"}>Stores</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={clsx("w-2 h-2 rounded-full", isDark ? "bg-[#e8dcc4]" : "bg-orange-600")}></div>
          <span className={isDark ? "text-[#e8dcc4]/60" : "text-orange-700/70"}>Your Location</span>
        </div>
      </div>
    </div>
  )
}
