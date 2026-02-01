"use client"

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps"
import { useTheme } from "@/contexts/theme-context"
import { geocodeMultipleStores, geocodePostalCode, getUserLocation, canonicalizeStoreName } from "@/lib/geocoding-adapter"
import { Loader2, MapPin, AlertCircle, Navigation, Footprints, Car, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char as keyof typeof HTML_ESCAPE_LOOKUP] ?? char)

const MapInstanceBridge = ({ onReady }: { onReady: (map: google.maps.Map) => void }) => {
  const map = useMap()
  useEffect(() => {
    if (map) {
      onReady(map)
    }
  }, [map, onReady])
  return null
}

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
  outOfRadius?: boolean
  distanceMiles?: number
  locationHint?: string
  providerAliases?: string[]
  canonicalKey?: string
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
  const googleMapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map())
  const storeLocationsRef = useRef<Map<number, { lat: number; lng: number }>>(new Map())
  const storeResolvedNamesRef = useRef<Map<number, string | undefined>>(new Map())
  const userMarkerRef = useRef<google.maps.Marker | null>(null)
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null)
  const directionsRenderersRef = useRef<Map<number, google.maps.DirectionsRenderer>>(new Map())
  const travelTimesRef = useRef<Map<number, string>>(new Map())
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [customAddress, setCustomAddress] = useState("")
  const [geocodingAddress, setGeocodingAddress] = useState(false)
  const [travelMode, setTravelMode] = useState<"WALKING" | "DRIVING">("DRIVING")
  const [showRoutes, setShowRoutes] = useState(false)
  const [travelTimes, setTravelTimes] = useState<Map<number, string>>(new Map())
  const [skippedStores, setSkippedStores] = useState<string[]>([])
  const [mapReady, setMapReady] = useState(false)

  const mapApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID

  const isDark = theme === "dark"
  const radiusLimitMiles = maxDistanceMiles ? maxDistanceMiles * 3 : null
  const handleMapReady = useCallback((map: google.maps.Map) => {
    googleMapRef.current = map
    setMapReady(true)
  }, [])

  useEffect(() => {
    if (!mapApiKey) {
      setError("Google Maps API key not configured")
      setIsLoading(false)
    }
  }, [mapApiKey])

  const buildInfoWindowContent = useCallback(
    (comparison: StoreComparison, travelTime?: string, matchedName?: string) => {
      const bgColor = isDark ? "#1f1e1a" : "#ffffff"
      const textColor = isDark ? "#f5f2e9" : "#1f2937"
      const mutedColor = isDark ? "#c8c3b5" : "#4b5563"
      const extraCostColor = comparison.savings > 0 ? (isDark ? "#f87171" : "#dc2626") : (isDark ? "#4ade80" : "#15803d")
      const distanceSection =
        typeof comparison.distanceMiles === "number"
          ? `<div style="margin-top:6px;font-size:13px;color:${mutedColor};">Distance: ${comparison.distanceMiles.toFixed(1)} mi</div>`
          : ""
      const travelSection = travelTime
        ? `<div style="margin-top:4px;font-size:13px;color:${mutedColor};">Est. ${
            travelMode === "WALKING" ? "walk" : "drive"
          }: ${travelTime}</div>`
        : ""
      const brandName = comparison.store?.trim() ?? ""
      const requestedAlias = comparison.providerAliases?.[0]?.trim() || brandName
      const additionalAliases =
        comparison.providerAliases
          ?.slice(1)
          ?.filter((alias) => alias && alias.toLowerCase() !== brandName.toLowerCase()) ?? []
      const resolvedName = matchedName?.trim()
      const fallbackName = requestedAlias || brandName || resolvedName || "Store"
      const rawRequested = requestedAlias || fallbackName
      const safeResolvedName = escapeHtml(resolvedName || fallbackName)
      const safeRequested = escapeHtml(rawRequested)
      const aliasMeta: string[] = []
      if (brandName && brandName.toLowerCase() !== (resolvedName || "").toLowerCase()) {
        aliasMeta.push(`Brand: ${escapeHtml(brandName)}`)
      }
      if (requestedAlias && requestedAlias.toLowerCase() !== brandName.toLowerCase()) {
        aliasMeta.push(`Requested: ${safeRequested}`)
      }
      if (additionalAliases.length) {
        const aliasPreview =
          additionalAliases.length > 2
            ? `${additionalAliases.slice(0, 2).join(", ")}…`
            : additionalAliases.join(", ")
        aliasMeta.push(`Also seen as: ${escapeHtml(aliasPreview)}`)
      }

      const titleHtml = `<div style="font-size:15px;font-weight:600;">${safeRequested}</div>`
      const subtitleParts: string[] = []
      if (resolvedName && rawRequested && resolvedName.toLowerCase() !== rawRequested.toLowerCase()) {
        subtitleParts.push(`Found: ${safeResolvedName}`)
      }
      if (aliasMeta.length > 0) {
        subtitleParts.push(aliasMeta.join(" • "))
      }
      const subtitleHtml = subtitleParts.length
        ? `<div style="margin-top:4px;font-size:12px;color:${mutedColor};">${subtitleParts.join(" • ")}</div>`
        : ""

      return `
        <div style="min-width:220px;background:${bgColor};color:${textColor};padding:12px;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,0.25);font-family:'Inter',system-ui,sans-serif;">
          ${titleHtml}
          ${subtitleHtml}
          <div style="margin-top:6px;font-size:14px;">Total: <strong>$${comparison.total.toFixed(2)}</strong></div>
          ${
            comparison.savings > 0
              ? `<div style="font-size:13px;color:${extraCostColor};margin-top:2px;">+$${comparison.savings.toFixed(
                  2
                )} vs best</div>`
              : `<div style="font-size:13px;color:${extraCostColor};margin-top:2px;">Best price!</div>`
          }
          ${distanceSection}
          ${travelSection}
        </div>
      `
    },
    [isDark, travelMode]
  )

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
      console.log("[StoreMap] Updated user location from custom address", {
        coordinates: location,
        address: customAddress,
      })

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
        setSkippedStores([])
        setError(null)

        if (!mapApiKey) {
          setError("Google Maps API key not configured")
          setIsLoading(false)
          return
        }

        // Wait for map context to be ready
        if (!mapReady) {
          return
        }
        if (typeof google === "undefined" || !googleMapRef.current) {
          setError("Google Maps API not loaded. Please ensure the script is available.")
          setIsLoading(false)
          return
        }

        // Get user location (fallback to postal code if geolocation not available)
        let userLoc = await getUserLocation()
        let usedPostalFallback = false
        if (!userLoc && userPostalCode) {
          userLoc = await geocodePostalCode(userPostalCode)
          usedPostalFallback = !!userLoc
        }
        setUserLocation(userLoc)
        if (userLoc) {
          console.log("[StoreMap] Using initial user location", {
            coordinates: userLoc,
            postalCodeFallback: usedPostalFallback ? userPostalCode : undefined,
          })
        } else {
          console.warn("[StoreMap] No user location available for initial map render", { userPostalCode })
        }

        // Clear previous markers and routes before re-rendering
        markersRef.current.forEach((marker) => marker.setMap(null))
        markersRef.current.clear()
        storeLocationsRef.current.clear()
        directionsRenderersRef.current.forEach((renderer) => renderer.setMap(null))
        directionsRenderersRef.current.clear()
        travelTimesRef.current.clear()
        setTravelTimes(new Map())

        const map = googleMapRef.current
        map.setOptions({
          mapTypeControl: true,
          fullscreenControl: true,
          zoomControl: true,
          styles: mapStyle,
        })

        if (!directionsServiceRef.current) {
          directionsServiceRef.current = new google.maps.DirectionsService()
        }
        if (!infoWindowRef.current) {
          infoWindowRef.current = new google.maps.InfoWindow({
            maxWidth: 280,
          })
        }

        // Add user location marker if available
        if (userMarkerRef.current) {
          userMarkerRef.current.setMap(null)
          userMarkerRef.current = null
        }
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
        } else {
          userMarkerRef.current = null
        }

        // Geocode stores and add markers
        const storeQueryEntries = comparisons.map((comparison, index) => {
          const aliasCandidates = Array.from(
            new Set(
              [
                ...(comparison.providerAliases ?? []),
                comparison.store,
              ]
                .map((alias) => alias?.trim())
                .filter((alias): alias is string => !!alias)
            )
          )
          const primaryAlias = aliasCandidates[0] || comparison.store || `Store ${index + 1}`
          const aliasHints = aliasCandidates.slice(1)
          const hintPieces = [comparison.locationHint, aliasHints.length ? aliasHints.join(", ") : null].filter(Boolean)
          return {
            queryName: primaryAlias || comparison.store || `Store ${index + 1}`,
            hint: hintPieces.length > 0 ? hintPieces.join(" • ") : undefined,
            aliases: aliasCandidates.length ? aliasCandidates : undefined,
          }
        })
        const storeNames = storeQueryEntries.map((entry) => entry.queryName)
        const storeMetadata = new Map(
          storeQueryEntries.map((entry) => [entry.queryName, { hint: entry.hint, aliases: entry.aliases }])
        )
        console.log(`[StoreMap] Found ${comparisons.length} stores to geocode:`, storeNames)
        const geocodedStores = await geocodeMultipleStores(
          storeNames,
          userPostalCode,
          userLoc || undefined,
          maxDistanceMiles,
          storeMetadata
        )
        console.log(`[StoreMap] Geocoded ${geocodedStores.size} stores:`, Array.from(geocodedStores.keys()))

        const bounds = new google.maps.LatLngBounds()

        const missingMarkers: string[] = []

        // Add user location to bounds
        if (userLoc) {
          bounds.extend(userLoc)
        }

        // Reset stored marker positions
        storeLocationsRef.current = new Map()
        storeResolvedNamesRef.current = new Map()

        // Add markers for each store
        comparisons.forEach((comparison, index) => {
          const canonicalName =
            comparison.canonicalKey || canonicalizeStoreName(storeQueryEntries[index]?.queryName || comparison.store)
          const geocoded = geocodedStores.get(canonicalName)

          if (comparison.outOfRadius) {
            console.log(`[StoreMap] Skipping ${comparison.store} because it is marked out of radius`, {
              coordinates: geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null,
              formattedAddress: geocoded?.formattedAddress,
            })
            missingMarkers.push(`${comparison.store} (outside your distance filter)`)
            return
          }

          console.log(`[StoreMap] Processing store #${index}: ${comparison.store}, geocoded:`, geocoded)

          if (!geocoded) {
            console.warn(`Could not geocode store: ${comparison.store}`)
            missingMarkers.push(`${comparison.store} (no matching map location)`)
            return
          }

          const position = { lat: geocoded.lat, lng: geocoded.lng }
          const resolvedStoreName = geocoded.matchedName?.trim()
          const distanceFromUser =
            userLoc && position
              ? calculateDistance(userLoc.lat, userLoc.lng, position.lat, position.lng)
              : comparison.distanceMiles

          if (radiusLimitMiles && typeof distanceFromUser === "number" && distanceFromUser > radiusLimitMiles) {
            console.warn(`[StoreMap] Skipping ${comparison.store} marker beyond limit`, {
              distanceMiles: distanceFromUser,
              limitMiles: radiusLimitMiles,
              coordinates: position,
            })
            missingMarkers.push(
              `${comparison.store} (${distanceFromUser?.toFixed(1)}mi away exceeds ${radiusLimitMiles.toFixed(0)}mi map radius)`
            )
            return
          }

          storeLocationsRef.current.set(index, position)
          storeResolvedNamesRef.current.set(index, resolvedStoreName)

          bounds.extend(position)

          // Create marker with simple color coding
          const isSelected = selectedStoreIndex === index
          const markerColor = isSelected ? "FF6B6B" : "4A90E2"

          const markerTitleParts = Array.from(
            new Set(
              [resolvedStoreName, comparison.store, ...(comparison.providerAliases ?? [])].filter(
                (name): name is string => !!name?.trim(),
              ),
            ),
          )
          const markerTitle = markerTitleParts.join(" • ")

          const marker = new google.maps.Marker({
            position,
            map,
            title: markerTitle,
            icon: `http://maps.google.com/mapfiles/ms/icons/${markerColor === "FF6B6B" ? "red" : "blue"}-dot.png`,
          })

          marker.addListener("click", () => {
            if (onStoreSelected) {
              onStoreSelected(index)
            }
            if (infoWindowRef.current) {
              const travelTime = travelTimesRef.current.get(index)
              const resolvedName = storeResolvedNamesRef.current.get(index)
              infoWindowRef.current.setContent(buildInfoWindowContent(comparison, travelTime, resolvedName))
              infoWindowRef.current.open(map, marker)
            }
          })

          markersRef.current.set(index, marker)
          console.log(`[StoreMap] Created marker #${index} for ${comparison.store} at lat: ${position.lat}, lng: ${position.lng}`)
        })

        setSkippedStores(Array.from(new Set(missingMarkers)))

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
    // IMPORTANT: Only re-geocode when comparisons, postal code, distance, or map readiness changes
    // Do NOT re-geocode on theme changes (isDark, mapStyle) - that's wasteful and expensive!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only include store identifiers, not items/totals
    // This prevents re-geocoding when just item prices change
    JSON.stringify(comparisons.map(c => ({
      store: c.store,
      canonicalKey: c.canonicalKey,
      locationHint: c.locationHint,
      providerAliases: c.providerAliases,
      outOfRadius: c.outOfRadius
    }))),
    userPostalCode,
    maxDistanceMiles,
    mapReady,
    mapApiKey
  ])

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

      if (isSelected && googleMapRef.current) {
        const position = marker.getPosition()
        if (position) {
          googleMapRef.current.panTo(position)
        }
        if (infoWindowRef.current) {
          const comparison = comparisons[index]
          if (comparison) {
            const travelTime = travelTimesRef.current.get(index)
            const resolvedName = storeResolvedNamesRef.current.get(index)
            infoWindowRef.current.setContent(buildInfoWindowContent(comparison, travelTime, resolvedName))
          }
        }
      }
    })
  }, [selectedStoreIndex, comparisons, buildInfoWindowContent])

  useEffect(() => {
    if (selectedStoreIndex === undefined || selectedStoreIndex === null) return
    const marker = markersRef.current.get(selectedStoreIndex)
    const comparison = comparisons[selectedStoreIndex]
    if (!marker || !comparison || !infoWindowRef.current) return
    const travelTime = travelTimesRef.current.get(selectedStoreIndex)
    const resolvedName = storeResolvedNamesRef.current.get(selectedStoreIndex)
    infoWindowRef.current.setContent(buildInfoWindowContent(comparison, travelTime, resolvedName))
  }, [travelTimes, selectedStoreIndex, comparisons, buildInfoWindowContent])

  // Request and display routes to stores
  const requestDirections = async () => {
    if (!directionsServiceRef.current || !userLocation || !googleMapRef.current) {
      console.warn("[StoreMap] Cannot request directions - missing required data")
      return
    }

    const map = googleMapRef.current
    const times = new Map<number, string>()
    const markerEntries = Array.from(storeLocationsRef.current.entries())

    if (markerEntries.length === 0) {
      console.warn("[StoreMap] No store markers available for routing")
      return
    }

    console.log(`[StoreMap] Requesting directions for ${markerEntries.length} stores with mode: ${travelMode}`)

    for (const [index, destination] of markerEntries) {
      try {
        const request: google.maps.DirectionsRequest = {
          origin: userLocation,
          destination,
          travelMode: google.maps.TravelMode[travelMode as keyof typeof google.maps.TravelMode],
        }

        const result = await directionsServiceRef.current!.route(request)

        let renderer = directionsRenderersRef.current.get(index)
        if (!renderer) {
          renderer = new google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: index === selectedStoreIndex ? "#ff6b6b" : "#4a90e2",
              strokeOpacity: showRoutes ? 0.8 : 0,
              strokeWeight: 4,
            },
          })
          directionsRenderersRef.current.set(index, renderer)
        } else {
          renderer.setMap(showRoutes ? map : null)
          renderer.setOptions({
            polylineOptions: {
              strokeColor: index === selectedStoreIndex ? "#ff6b6b" : "#4a90e2",
              strokeOpacity: showRoutes ? 0.8 : 0,
              strokeWeight: 4,
            },
          })
        }

        renderer.setDirections(result)

        const leg = result.routes[0]?.legs?.[0]
        if (leg?.duration?.text) {
          times.set(index, leg.duration.text)
          travelTimesRef.current.set(index, leg.duration.text)
          console.log(`[StoreMap] ${comparisons[index]?.store ?? index}: ${leg.duration.text} via ${travelMode.toLowerCase()}`)
        }
      } catch (error) {
        console.error(`[StoreMap] Failed to get directions for ${comparisons[index]?.store ?? index}:`, error)
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
        style={{ height: "500px" }}
      >
        {mapApiKey ? (
          <APIProvider apiKey={mapApiKey} libraries={["places"]}>
            <GoogleMap
              mapId={mapId}
              defaultCenter={userLocation ?? { lat: 37.7749, lng: -122.4194 }}
              defaultZoom={12}
              gestureHandling="greedy"
              className="w-full h-full"
            >
              <MapInstanceBridge onReady={handleMapReady} />
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-red-600 bg-red-50">
            Missing Google Maps API key.
          </div>
        )}
      </div>

      {!isLoading && skippedStores.length > 0 && (
        <div
          className={clsx(
            "text-xs rounded-lg border p-3",
            isDark ? "bg-[#181813] border-[#e8dcc4]/20 text-[#e8dcc4]/70" : "bg-orange-50/60 border-orange-200/70 text-orange-800"
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
