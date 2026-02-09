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
