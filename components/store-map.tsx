"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { useTheme } from "@/contexts/theme-context"
import { geocodeMultipleStores, getUserLocation } from "@/lib/geocoding"
import { Loader2, MapPin, AlertCircle, Navigation, Footprints, Car, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

// Declare google namespace for TypeScript
declare global {
  namespace google {
    namespace maps {
      class Map {
        constructor(element: HTMLElement, options: google.maps.MapOptions)
        setCenter(latlng: google.maps.LatLng | google.maps.LatLngLiteral): void
        setZoom(zoom: number): void
        setOptions(options: google.maps.MapOptions): void
        fitBounds(bounds: google.maps.LatLngBounds, padding?: number | google.maps.Padding): void
      }
      class Marker {
        constructor(options: google.maps.MarkerOptions)
        addListener(eventName: string, callback: Function): void
        setIcon(icon: string | google.maps.Icon | google.maps.Symbol): void
        setMap(map: google.maps.Map | null): void
      }
      class InfoWindow {
        constructor(options: google.maps.InfoWindowOptions)
        open(map: google.maps.Map, anchor?: google.maps.Marker): void
        setMap(map: google.maps.Map | null): void
      }
      class LatLngBounds {
        extend(point: google.maps.LatLng | google.maps.LatLngLiteral): void
      }
      class DirectionsService {
        route(request: google.maps.DirectionsRequest): Promise<google.maps.DirectionsResult>
      }
      class DirectionsRenderer {
        constructor(options: google.maps.DirectionsRendererOptions)
        setDirections(result: google.maps.DirectionsResult): void
        setMap(map: google.maps.Map | null): void
      }
      enum TravelMode {
        DRIVING = "DRIVING",
        WALKING = "WALKING",
        BICYCLING = "BICYCLING",
        TRANSIT = "TRANSIT",
      }
      enum SymbolPath {
        CIRCLE = 0,
      }
      interface MapOptions {
        zoom?: number
        mapTypeControl?: boolean
        fullscreenControl?: boolean
        zoomControl?: boolean
        styles?: google.maps.MapTypeStyle[]
      }
      interface MarkerOptions {
        position: google.maps.LatLng | google.maps.LatLngLiteral
        map?: google.maps.Map
        title?: string
        icon?: string | google.maps.Icon | google.maps.Symbol
        zIndex?: number
      }
      interface InfoWindowOptions {
        content?: string
      }
      interface DirectionsRequest {
        origin: google.maps.LatLng | google.maps.LatLngLiteral | string
        destination: google.maps.LatLng | google.maps.LatLngLiteral | string
        travelMode: google.maps.TravelMode
      }
      interface DirectionsRendererOptions {
        map?: google.maps.Map
        suppressMarkers?: boolean
        polylineOptions?: google.maps.PolylineOptions
      }
      interface PolylineOptions {
        strokeColor?: string
        strokeOpacity?: number
        strokeWeight?: number
      }
      interface DirectionsResult {
        routes: google.maps.DirectionsRoute[]
      }
      interface DirectionsRoute {
        legs: google.maps.DirectionsLeg[]
      }
      interface DirectionsLeg {
        duration?: google.maps.Duration
      }
      interface Duration {
        text: string
      }
      interface Icon {
        path: string
        scale: number
        fillColor: string
        fillOpacity: number
        strokeColor: string
        strokeWeight: number
      }
      interface Symbol {
        path: number
        scale: number
        fillColor: string
        fillOpacity: number
        strokeColor: string
        strokeWeight: number
      }
      interface MapTypeStyle {
        elementType?: string
        stylers: Array<{[key: string]: any}>
        featureType?: string
      }
      interface LatLngLiteral {
        lat: number
        lng: number
      }
      class LatLng {}
      interface Padding {
        top: number
        right: number
        bottom: number
        left: number
      }
    }
  }
}

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
  maxDistanceMiles?: number
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959 // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Store Map Component
 * Displays a Google Map with:
 * - User's current location marker
 * - Store comparison result markers with price and name
 * - Click handlers to sync with carousel
 */
export function StoreMap({ comparisons, onStoreSelected, userPostalCode, selectedStoreIndex, maxDistanceMiles }: StoreMapProps) {
  const { theme } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map())
  const userMarkerRef = useRef<google.maps.Marker | null>(null)
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null)
  const directionsRenderersRef = useRef<Map<number, google.maps.DirectionsRenderer>>(new Map())
  const travelTimesRef = useRef<Map<number, string>>(new Map())

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [customAddress, setCustomAddress] = useState("")
  const [geocodingAddress, setGeocodingAddress] = useState(false)
  const [travelMode, setTravelMode] = useState<"WALKING" | "DRIVING">("DRIVING")
  const [showRoutes, setShowRoutes] = useState(false)
  const [travelTimes, setTravelTimes] = useState<Map<number, string>>(new Map())

  const isDark = theme === "dark"

  // Geocode custom address and update user marker
  const handleAddressSearch = async () => {
    if (!customAddress.trim()) return

    setGeocodingAddress(true)
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      if (!apiKey) {
        setError("Google Maps API key not configured")
        setGeocodingAddress(false)
        return
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          customAddress
        )}&key=${apiKey}`
      )

      if (!response.ok) {
        setError("Failed to geocode address")
        setGeocodingAddress(false)
        return
      }

      const data = await response.json()

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        setError("Address not found")
        setGeocodingAddress(false)
        return
      }

      const location = {
        lat: data.results[0].geometry.location.lat,
        lng: data.results[0].geometry.location.lng,
      }

      setUserLocation(location)

      // Update user marker position
      if (userMarkerRef.current && googleMapRef.current) {
        userMarkerRef.current.setMap(null)
        userMarkerRef.current = new google.maps.Marker({
          position: location,
          map: googleMapRef.current,
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

        // Re-center map on new location
        googleMapRef.current.setCenter(location)
      }

      setError(null)
    } catch (err) {
      console.error("Address geocoding error:", err)
      setError("Failed to search address")
    } finally {
      setGeocodingAddress(false)
    }
  }

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

          // Initialize Directions Service for route visualization
          directionsServiceRef.current = new google.maps.DirectionsService()
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
        console.log(`[StoreMap] Found ${comparisons.length} stores to geocode:`, storeNames)
        const geocodedStores = await geocodeMultipleStores(storeNames, userPostalCode, userLoc || undefined)
        console.log(`[StoreMap] Geocoded ${geocodedStores.size} stores:`, Array.from(geocodedStores.keys()))

        const bounds = new google.maps.LatLngBounds()

        // Add user location to bounds
        if (userLoc) {
          bounds.extend(userLoc)
        }

        // Add markers for each store
        comparisons.forEach((comparison, index) => {
          const geocoded = geocodedStores.get(comparison.store)
          console.log(`[StoreMap] Processing store #${index}: ${comparison.store}, geocoded:`, geocoded)

          if (!geocoded) {
            console.warn(`Could not geocode store: ${comparison.store}`)
            return
          }

          const position = { lat: geocoded.lat, lng: geocoded.lng }

          // Filter by distance if maxDistanceMiles is set and user location is available
          if (maxDistanceMiles && userLoc) {
            const distance = calculateDistance(userLoc.lat, userLoc.lng, position.lat, position.lng)
            if (distance > maxDistanceMiles) {
              console.log(`[StoreMap] Skipping store ${comparison.store} - distance ${distance.toFixed(2)} miles exceeds max ${maxDistanceMiles} miles`)
              return
            }
            console.log(`[StoreMap] Including store ${comparison.store} - distance ${distance.toFixed(2)} miles within max ${maxDistanceMiles} miles`)
          }

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
          console.log(`[StoreMap] Created marker #${index} for ${comparison.store} at lat: ${position.lat}, lng: ${position.lng}`)
        })

        // Center and zoom to fit all markers
        console.log(`[StoreMap] Total markers created: ${markersRef.current.size}`)
        if (markersRef.current.size > 0) {
          console.log(`[StoreMap] Fitting bounds with ${markersRef.current.size} markers`)
          map.fitBounds(bounds, {
            top: 100,
            right: 100,
            bottom: 100,
            left: 100,
          })
        } else if (userLoc) {
          console.log(`[StoreMap] No markers created, centering on user location`)
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

  // Request and display routes to stores
  const requestDirections = async () => {
    if (!directionsServiceRef.current || !userLocation || !googleMapRef.current) {
      console.warn("[StoreMap] Cannot request directions - missing required data")
      return
    }

    const map = googleMapRef.current
    const times = new Map<number, string>()

    console.log(`[StoreMap] Requesting directions for ${comparisons.length} stores with mode: ${travelMode}`)

    for (let i = 0; i < comparisons.length; i++) {
      const geocoded = await geocodeMultipleStores([comparisons[i].store])
      const storeLocation = geocoded.get(comparisons[i].store)

      if (!storeLocation) {
        console.warn(`[StoreMap] Could not geocode store for directions: ${comparisons[i].store}`)
        continue
      }

      try {
        const request: google.maps.DirectionsRequest = {
          origin: userLocation,
          destination: { lat: storeLocation.lat, lng: storeLocation.lng },
          travelMode: google.maps.TravelMode[travelMode as keyof typeof google.maps.TravelMode],
        }

        const result = await directionsServiceRef.current!.route(request)

        // Create or update directions renderer for this store
        let renderer = directionsRenderersRef.current.get(i)
        if (!renderer) {
          renderer = new google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: i === selectedStoreIndex ? "#ff6b6b" : "#4a90e2",
              strokeOpacity: 0.7,
              strokeWeight: 3,
            },
          })
          directionsRenderersRef.current.set(i, renderer)
        }

        renderer.setDirections(result)

        // Extract travel time
        const route = result.routes[0]
        if (route && route.legs[0]) {
          const duration = route.legs[0].duration?.text || "Unknown"
          times.set(i, duration)
          travelTimesRef.current.set(i, duration)
          console.log(`[StoreMap] ${comparisons[i].store}: ${duration} via ${travelMode.toLowerCase()}`)
        }
      } catch (error) {
        console.error(`[StoreMap] Error getting directions for ${comparisons[i].store}:`, error)
      }
    }

    setTravelTimes(times)
  }

  // Handle travel mode changes
  const handleTravelModeChange = (mode: "WALKING" | "DRIVING") => {
    setTravelMode(mode)
    // Don't hide routes, just clear them so we can re-request with new mode
    directionsRenderersRef.current.forEach((renderer) => {
      renderer.setMap(null)
    })
    directionsRenderersRef.current.clear()
    setTravelTimes(new Map())
    // Re-request directions with new mode
    setTimeout(() => {
      requestDirections()
    }, 100)
  }

  // Auto-request directions when showRoutes changes and mode is set
  useEffect(() => {
    if (showRoutes && userLocation) {
      const timer = setTimeout(() => {
        requestDirections()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [showRoutes, travelMode, userLocation])

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

      {/* Address Search Bar */}
      {!isLoading && !error && (
        <div className={clsx(
          "flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border",
          isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-orange-50/50 border-orange-200/50"
        )}>
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
                isDark ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 text-white hover:bg-orange-600"
              )}
            >
              {geocodingAddress ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
      )}

      {/* Route Controls */}
      {!isLoading && !error && (
        <div className={clsx(
          "flex flex-col sm:flex-row items-center gap-3 p-3 rounded-lg border",
          isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-orange-50/50 border-orange-200/50"
        )}>
          <button
            onClick={() => {
              setShowRoutes(!showRoutes)
              if (!showRoutes) {
                requestDirections()
              } else {
                // Clear routes
                directionsRenderersRef.current.forEach((renderer) => {
                  renderer.setMap(null)
                })
                directionsRenderersRef.current.clear()
                setTravelTimes(new Map())
              }
            }}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              showRoutes
                ? isDark ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-orange-200 text-orange-700"
                : isDark ? "bg-[#e8dcc4]/10 text-[#e8dcc4]/70 hover:bg-[#e8dcc4]/20" : "bg-orange-100/50 text-orange-600 hover:bg-orange-200/50"
            )}
          >
            <Navigation className="w-4 h-4" />
            {showRoutes ? "Hide Routes" : "Show Routes"}
          </button>

          {showRoutes && (
            <>
              <button
                onClick={() => handleTravelModeChange("WALKING")}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  travelMode === "WALKING"
                    ? isDark ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-orange-200 text-orange-700"
                    : isDark ? "bg-[#e8dcc4]/10 text-[#e8dcc4]/70 hover:bg-[#e8dcc4]/20" : "bg-orange-100/50 text-orange-600 hover:bg-orange-200/50"
                )}
              >
                <Footprints className="w-4 h-4" />
                Walk
              </button>

              <button
                onClick={() => handleTravelModeChange("DRIVING")}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  travelMode === "DRIVING"
                    ? isDark ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-orange-200 text-orange-700"
                    : isDark ? "bg-[#e8dcc4]/10 text-[#e8dcc4]/70 hover:bg-[#e8dcc4]/20" : "bg-orange-100/50 text-orange-600 hover:bg-orange-200/50"
                )}
              >
                <Car className="w-4 h-4" />
                Drive
              </button>
            </>
          )}
        </div>
      )}

      <div
        className={clsx("w-full rounded-lg border overflow-hidden", isDark ? "border-[#e8dcc4]/30" : "border-orange-200")}
        style={{ height: "500px", display: isLoading ? "none" : "block" }}
      >
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Travel Times Display */}
      {showRoutes && travelTimes.size > 0 && (
        <div className={clsx(
          "p-3 rounded-lg border",
          isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-orange-50/50 border-orange-200/50"
        )}>
          <h3 className={clsx("text-sm font-semibold mb-2", isDark ? "text-[#e8dcc4]" : "text-orange-700")}>
            Estimated Travel Times ({travelMode === "WALKING" ? "Walking" : "Driving"})
          </h3>
          <div className="space-y-1 text-xs">
            {Array.from(travelTimes.entries()).map(([storeIndex, duration]) => (
              <div key={storeIndex} className={clsx(
                "flex justify-between items-center p-2 rounded",
                isDark ? "bg-[#0a0a0a] text-[#e8dcc4]" : "bg-white text-orange-700"
              )}>
                <span className="font-medium">{comparisons[storeIndex]?.store || "Store"}</span>
                <span>{duration}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
