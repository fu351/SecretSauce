import { NextRequest, NextResponse } from "next/server"

const API_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

type MapsAction = "geocode" | "place-nearby" | "place-text" | "routes"

type LatLng = { lat: number; lng: number }

const buildUrl = (base: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(base)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  })
  return url
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Google Maps API key is not configured." }, { status: 500 })
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
        const address = params.address as string | undefined
        const latlng = params.latlng as string | undefined
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
        const location = params.location as LatLng | undefined
        const radius = params.radius as number | undefined
        const keyword = params.keyword as string | undefined
        const type = params.type as string | undefined
        if (!location || typeof radius !== "number" || !keyword) {
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
        const query = params.query as string | undefined
        const location = params.location as LatLng | undefined
        const radius = params.radius as number | undefined
        if (!query) {
          return NextResponse.json({ error: "Missing query parameter." }, { status: 400 })
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
        const origin = params.origin as LatLng | undefined
        const destination = params.destination as LatLng | undefined
        const travelMode = params.travelMode || "DRIVE"
        if (!origin || !destination) {
          return NextResponse.json({ error: "Missing origin or destination." }, { status: 400 })
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
