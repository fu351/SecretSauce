type LatLng = { lat: number; lng: number }

type GoogleGeocodeResult = {
  geometry?: {
    location?: {
      lat?: number
      lng?: number
    }
  }
}

type GoogleGeocodeResponse = {
  status?: string
  results?: GoogleGeocodeResult[]
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const trimmed = address.trim()
  if (!trimmed) return null

  try {
    const response = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "geocode",
        params: { address: trimmed },
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as GoogleGeocodeResponse
    const first = data?.results?.[0]?.geometry?.location
    if (typeof first?.lat !== "number" || typeof first?.lng !== "number") {
      return null
    }

    return { lat: first.lat, lng: first.lng }
  } catch {
    return null
  }
}

export async function geocodePostalCode(input: string): Promise<LatLng | null> {
  return geocodeAddress(input)
}

export async function getUserLocation(): Promise<LatLng | null> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return null
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    )
  })
}

export type UpdateLocationResult = {
  success: boolean
  location: LatLng | null
  error?: string
}

/**
 * Update the user's profile coordinates from browser geolocation.
 * Preferred-store sync is handled automatically by DB triggers:
 *   trg_location_hierarchy_sync → builds geom from lat/lng
 *   trg_refresh_preferred_stores → refreshes user_preferred_stores from geom
 */
export async function updateLocation(userId: string): Promise<UpdateLocationResult> {
  const resolvedUserId = String(userId || "").trim()
  if (!resolvedUserId) {
    return {
      success: false,
      location: null,
      error: "Missing user id.",
    }
  }

  const location = await getUserLocation()
  if (!location) {
    return {
      success: false,
      location: null,
      error: "Unable to read browser location.",
    }
  }

  const response = await fetch("/api/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: location.lat, lng: location.lng }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    return {
      success: false,
      location,
      error: `Failed to update profile coordinates: ${(data as any)?.error ?? response.statusText}`,
    }
  }

  return {
    success: true,
    location,
  }
}