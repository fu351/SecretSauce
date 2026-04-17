import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("POST /api/recipe-import/instagram", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env.PYTHON_SERVICE_URL = "https://python.example.com/"
    delete process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.PYTHON_SERVICE_URL
    delete process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL
  })

  it("returns 400 when the request body is invalid JSON", async () => {
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid request body. Send JSON with a "url" field.',
    })
  })

  it("returns 400 for invalid Instagram URLs", async () => {
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/not-instagram" }),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      success: false,
      error: expect.stringContaining("valid Instagram"),
    })
  })

  it("returns 503 when the import service is not configured", async () => {
    delete process.env.PYTHON_SERVICE_URL
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://www.instagram.com/reel/ABC12345/?utm_source=foo" }),
      }) as any
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      success: false,
      error: "Import service is not configured. Please try again later.",
    })
  })

  it("normalizes the Instagram URL and returns the backend response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, title: "Pasta Reel" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.instagram.com/reel/ABC12345/?utm_source=ig_web_copy_link#caption",
        }),
      }) as any
    )

    expect(fetchMock).toHaveBeenCalledWith("https://python.example.com/recipe-import/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.instagram.com/p/ABC12345/" }),
      signal: expect.any(AbortSignal),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, title: "Pasta Reel" })
  })

  it("returns 422 when the backend responds with a recipe-level validation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: "Could not extract recipe" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://www.instagram.com/p/ABC12345/" }),
      }) as any
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      success: false,
      error: "Could not extract recipe",
    })
  })

  it("returns 503 when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")))

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://www.instagram.com/p/ABC12345/" }),
      }) as any
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      success: false,
      error: "Could not reach the import service. Please check your connection and try again.",
    })
  })
})
