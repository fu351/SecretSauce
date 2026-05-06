import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { parseCookieConsentFromCookieHeader } from "@/lib/privacy/cookie-consent"
import { guardApiAvailability } from "@/lib/dev/api-availability"

const API_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

type MapsAction = "geocode" | "place-nearby" | "place-text" | "routes"

type LatLng = { lat: number; lng: number }

const MAX_TEXT_LENGTH = 200
const MAX_PLACE_RADIUS_METERS = 50000
const MAX_ROUTE_DISTANCE_DEGREES = 8
const ALLOWED_TRAVEL_MODES = new Set(["DRIVE", "BICYCLE", "WALK", "TWO_WHEELER", "TRANSIT"])
const MAPS_RATE_LIMIT_WINDOW_MS = 60_000
const MAPS_RATE_LIMIT_MAX_REQUESTS = 60
const mapsRateLimits = new Map<string, { count: number; resetAt: number }>()

const buildUrl = (base: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(base)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  })
  return url
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = mapsRateLimits.get(key)
  if (!entry || entry.resetAt <= now) {
    mapsRateLimits.set(key, { count: 1, resetAt: now + MAPS_RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= MAPS_RATE_LIMIT_MAX_REQUESTS) return false
  entry.count += 1
  return true
}

function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false
  const candidate = value as { lat?: unknown; lng?: unknown }
  return (
    typeof candidate.lat === "number" &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    candidate.lng >= -180 &&
    candidate.lng <= 180
  )
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return null
  return trimmed
}

function clampRadius(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return Math.min(Math.round(value), MAX_PLACE_RADIUS_METERS)
}

function routeDistanceDegrees(a: LatLng, b: LatLng): number {
  return Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng)
}

export async function POST(request: NextRequest) {
  const unavailable = guardApiAvailability("maps")
  if (unavailable) return unavailable

  if (!API_KEY) {
    return NextResponse.json({ error: "Google Maps API key is not configured." }, { status: 500 })
  }

  const authState = await auth()
  if (!authState.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!checkRateLimit(authState.userId)) {
    return NextResponse.json({ error: "Too many map requests. Please try again later." }, { status: 429 })
  }

  const thirdPartyAllowed = parseCookieConsentFromCookieHeader(request.headers.get("cookie"))?.thirdParty ?? false
  if (!thirdPartyAllowed) {
    return NextResponse.json(
      { error: "Third-party map services are disabled until cookie consent is granted." },
      { status: 403 }
    )
  }

  let body: { action?: MapsAction; params?: Record<string, any> }
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const { action, params } = body
  if (!action || !params) {
    return NextResponse.json({ error: "Missing action or params." }, { status: 400 })
  }

  try {
    switch (action) {
      case "geocode": {
        const address = sanitizeText(params.address)
        const latlng = sanitizeText(params.latlng)
        if (!address && !latlng) {
          return NextResponse.json({ error: "Missing address or latlng parameter." }, { status: 400 })
        }
        const url = buildUrl("https://maps.googleapis.com/maps/api/geocode/json", {
          address,
          latlng,
          key: API_KEY,
        })
        const response = await fetch(url)
        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
      }
      case "place-nearby": {
        const location = params.location
        const radius = clampRadius(params.radius)
        const keyword = sanitizeText(params.keyword)
        const type = sanitizeText(params.type)
        if (!isValidLatLng(location) || radius === null || !keyword) {
          return NextResponse.json({ error: "Missing location, radius, or keyword." }, { status: 400 })
        }
        const url = buildUrl("https://maps.googleapis.com/maps/api/place/nearbysearch/json", {
          location: `${location.lat},${location.lng}`,
          radius,
          keyword,
          type,
          key: API_KEY,
        })
        const response = await fetch(url)
        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
      }
      case "place-text": {
        const query = sanitizeText(params.query)
        const location = params.location
        const radius = params.radius === undefined ? undefined : clampRadius(params.radius)
        if (!query) {
          return NextResponse.json({ error: "Missing query parameter." }, { status: 400 })
        }
        if (location !== undefined && !isValidLatLng(location)) {
          return NextResponse.json({ error: "Invalid location parameter." }, { status: 400 })
        }
        if (params.radius !== undefined && radius === null) {
          return NextResponse.json({ error: "Invalid radius parameter." }, { status: 400 })
        }
        const url = buildUrl("https://maps.googleapis.com/maps/api/place/textsearch/json", {
          query,
          location: location ? `${location.lat},${location.lng}` : undefined,
          radius,
          key: API_KEY,
        })
        const response = await fetch(url)
        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
      }
      case "routes": {
        const origin = params.origin
        const destination = params.destination
        const travelMode = typeof params.travelMode === "string" ? params.travelMode.toUpperCase() : "DRIVE"
        if (!isValidLatLng(origin) || !isValidLatLng(destination)) {
          return NextResponse.json({ error: "Missing origin or destination." }, { status: 400 })
        }
        if (!ALLOWED_TRAVEL_MODES.has(travelMode)) {
          return NextResponse.json({ error: "Unsupported travel mode." }, { status: 400 })
        }
        if (routeDistanceDegrees(origin, destination) > MAX_ROUTE_DISTANCE_DEGREES) {
          return NextResponse.json({ error: "Route is outside the supported distance." }, { status: 400 })
        }
        const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
            destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
            travelMode,
            routingPreference: "TRAFFIC_AWARE",
          }),
        })
        const data = await response.json()
        return NextResponse.json(data, { status: response.status })
      }
      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error("[Maps Proxy] Request failed", error)
    return NextResponse.json({ error: "Failed to contact Google Maps services." }, { status: 502 })
  }
}
