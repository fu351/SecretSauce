"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { useTheme } from "@/contexts/theme-context"
import { geocodeMultipleStores, getUserLocation } from "@/lib/geocoding"
import { Loader2, MapPin, AlertCircle } from "lucide-react"
import clsx from "clsx"

interface StoreComparison {
  store: string
  items: any[]
  total: number
  savings: number
}

interface StoreMapProps {
  comparisons: StoreComparison[]
  onStoreSelected?: (storeIndex: number) => void
  userPostalCode?: string
  selectedStoreIndex?: number
}

/**
 * Store Map Component
 * Displays a Google Map with:
 * - User's current location marker
 * - Store comparison result markers with price and name
 * - Click handlers to sync with carousel
 */
export function StoreMap({ comparisons, onStoreSelected, userPostalCode, selectedStoreIndex }: StoreMapProps) {
  const { theme } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map())
  const userMarkerRef = useRef<google.maps.Marker | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const isDark = theme === "dark"

  // Map style for dark/warm theme
  const mapStyle = useMemo(() =>
    isDark
      ? [
          { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#a0a0a0" }] },
          { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b0" }] },
          { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b0" }] },
          { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#263c3f" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
          { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#4a4a4a" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#5a5a5a" }] },
          { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
          { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#0e1a1a" }] },
        ]
      : [
          // Warm theme - matches site's orange aesthetic
          { elementType: "geometry", stylers: [{ color: "#faf9f5" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#faf9f5" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#8b7355" }] },
          { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d97706" }] },
          { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d97706" }] },
          { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#fed7aa" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#f3e8dc" }] },
          { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fef3c7" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fde68a" }] },
          { featureType: "transit", elementType: "geometry", stylers: [{ color: "#f5deb3" }] },
          { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#e0e7ff" }] },
        ],
    [isDark]
  )

  // Initialize map and load store locations
  useEffect(() => {
    const initializeMap = async () => {
      try {
        setError(null)

        // Check if Google Maps API is loaded
        if (typeof google === "undefined") {
          setError("Google Maps API not loaded. Please ensure you have configured NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.")
          setIsLoading(false)
          return
        }

        // Get user location
        const userLoc = await getUserLocation()
        setUserLocation(userLoc)

        if (!mapRef.current) {
          setError("Map container not found")
          setIsLoading(false)
          return
        }

        if (!googleMapRef.current) {
          // Initialize Google Map
          googleMapRef.current = new google.maps.Map(mapRef.current, {
            zoom: 12,
            mapTypeControl: true,
            fullscreenControl: true,
            zoomControl: true,
            styles: mapStyle,
          })
        }

        const map = googleMapRef.current

        // Add user location marker if available
        if (userLoc) {
          userMarkerRef.current = new google.maps.Marker({
            position: userLoc,
            map,
            title: "Your Location",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#3b82f6",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
            zIndex: 1000,
          })
        }

        // Geocode stores and add markers
        const storeNames = comparisons.map((comp) => comp.store)
        const geocodedStores = await geocodeMultipleStores(storeNames, userPostalCode, userLoc || undefined)

        const bounds = new google.maps.LatLngBounds()

        // Add user location to bounds
        if (userLoc) {
          bounds.extend(userLoc)
        }

        // Add markers for each store
        comparisons.forEach((comparison, index) => {
          const geocoded = geocodedStores.get(comparison.store)

          if (!geocoded) {
            console.warn(`Could not geocode store: ${comparison.store}`)
            return
          }

          const position = { lat: geocoded.lat, lng: geocoded.lng }
          bounds.extend(position)

          // Create marker with simple color coding
          const isSelected = selectedStoreIndex === index
          const markerColor = isSelected ? "FF6B6B" : "4A90E2"

          const marker = new google.maps.Marker({
            position,
            map,
            title: comparison.store,
            icon: `http://maps.google.com/mapfiles/ms/icons/${markerColor === "FF6B6B" ? "red" : "blue"}-dot.png`,
          })

          // Add click listener to marker
          marker.addListener("click", () => {
            // Sync with carousel
            if (onStoreSelected) {
              onStoreSelected(index)
            }
          })

          // Create info window with store details
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div class="p-2">
                <h3 class="font-semibold">${comparison.store}</h3>
                <p class="text-sm">Total: $${comparison.total.toFixed(2)}</p>
                ${comparison.savings > 0 ? `<p class="text-sm text-green-600">Save: $${comparison.savings.toFixed(2)}</p>` : ""}
              </div>
            `,
          })

          marker.addListener("click", () => {
            infoWindow.open(map, marker)
          })

          markersRef.current.set(index, marker)
        })

        // Center and zoom to fit all markers
        if (markersRef.current.size > 0) {
          map.fitBounds(bounds, {
            top: 100,
            right: 100,
            bottom: 100,
            left: 100,
          })
        } else if (userLoc) {
          map.setCenter(userLoc)
          map.setZoom(12)
        }

        setIsLoading(false)
      } catch (err) {
        console.error("Map initialization error:", err)
        setError(err instanceof Error ? err.message : "Failed to initialize map")
        setIsLoading(false)
      }
    }

    initializeMap()
  }, [comparisons, userPostalCode, isDark, mapStyle])

  // Update map styles when theme changes
  useEffect(() => {
    if (googleMapRef.current) {
      googleMapRef.current.setOptions({ styles: mapStyle })
    }
  }, [isDark, mapStyle])

  // Update marker appearance when selected store changes
  useEffect(() => {
    markersRef.current.forEach((marker, index) => {
      const isSelected = index === selectedStoreIndex

      marker.setIcon(
        `http://maps.google.com/mapfiles/ms/icons/${isSelected ? "red" : "blue"}-dot.png`
      )
    })
  }, [selectedStoreIndex, comparisons])

  if (!comparisons || comparisons.length === 0) {
    return (
      <div
        className={clsx(
          "w-full h-96 rounded-lg border flex items-center justify-center",
          isDark ? "bg-[#181813] border-[#e8dcc4]/30" : "bg-gray-50 border-gray-200"
        )}
      >
        <p className={clsx("text-sm", isDark ? "text-[#e8dcc4]/60" : "text-gray-500")}>
          No store comparisons yet
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className={clsx(
          "flex items-center gap-2 p-3 rounded-lg border",
          isDark ? "bg-red-900/20 border-red-600/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"
        )}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {isLoading && (
        <div className={clsx(
          "flex items-center justify-center h-96 rounded-lg border",
          isDark
            ? "bg-[#181813] border-[#e8dcc4]/30"
            : "bg-orange-50 border-orange-200"
        )}>
          <div className="flex flex-col items-center gap-2">
            <Loader2 className={clsx("w-6 h-6 animate-spin", isDark ? "text-[#e8dcc4]" : "text-orange-600")} />
            <p className={clsx("text-sm", isDark ? "text-[#e8dcc4]/60" : "text-orange-600")}>Loading map...</p>
          </div>
        </div>
      )}

      <div
        className={clsx("w-full rounded-lg border overflow-hidden", isDark ? "border-[#e8dcc4]/30" : "border-orange-200")}
        style={{ height: "500px", display: isLoading ? "none" : "block" }}
      >
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className={clsx("flex items-center gap-4 text-xs p-2 rounded-lg", isDark ? "bg-[#181813] border border-[#e8dcc4]/20" : "bg-orange-50/50 border border-orange-200/50")}>
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
