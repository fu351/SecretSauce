import { afterEach, describe, expect, it, vi } from "vitest"

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

const loadPostHandler = async () => {
  vi.resetModules()
  const mod = await import("../route")
  return mod.POST
}

describe("POST /api/maps", () => {
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  it("returns 500 when no Google Maps key is configured", async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    delete process.env.GOOGLE_MAPS_API_KEY
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    const POST = await loadPostHandler()
    const res = await POST(
      new Request("http://localhost/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "geocode", params: { address: "1 Main St" } }),
      }) as any
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Google Maps API key is not configured." })
  })

  it("returns 400 for invalid JSON", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "maps_test_key"

    const POST = await loadPostHandler()
    const res = await POST(
      new Request("http://localhost/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad-json",
      }) as any
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid JSON body." })
  })

  it("proxies geocode requests and forwards upstream status", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "maps_test_key"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "OK", results: [{ place_id: "abc" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const POST = await loadPostHandler()
    const res = await POST(
      new Request("http://localhost/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "geocode",
          params: { address: "1600 Amphitheatre Parkway" },
        }),
      }) as any
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain("https://maps.googleapis.com/maps/api/geocode/json")
    expect(requestedUrl).toContain("address=1600+Amphitheatre+Parkway")
    expect(requestedUrl).toContain("key=maps_test_key")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "OK" })
  })

  it("calls computeRoutes with expected headers and default travel mode", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "maps_test_key"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ routes: [{ distanceMeters: 1500, duration: "320s" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const POST = await loadPostHandler()
    const res = await POST(
      new Request("http://localhost/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "routes",
          params: {
            origin: { lat: 37.77, lng: -122.41 },
            destination: { lat: 37.79, lng: -122.39 },
          },
        }),
      }) as any
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes")
    expect((init as RequestInit).method).toBe("POST")
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "maps_test_key",
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    })
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ routes: [{ distanceMeters: 1500 }] })
  })
})
