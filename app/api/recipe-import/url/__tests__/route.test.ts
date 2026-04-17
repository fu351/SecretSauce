import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("POST /api/recipe-import/url", () => {
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

  it("returns 400 when the URL is missing", async () => {
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: "URL is required",
    })
  })

  it("returns 400 when the URL format is invalid", async () => {
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "not-a-url" }),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid URL format",
    })
  })

  it("returns 500 when the Python service URL is not configured", async () => {
    delete process.env.PYTHON_SERVICE_URL
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      success: false,
      error: "Python service URL not configured",
    })
  })

  it("forwards the URL to the backend and returns the parsed recipe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, title: "Imported Soup" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }) as any
    )

    expect(fetchMock).toHaveBeenCalledWith("https://python.example.com/recipe-import/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/recipe" }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, title: "Imported Soup" })
  })

  it("propagates backend error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("backend unavailable", {
          status: 503,
        })
      )
    )

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }) as any
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      success: false,
      error: "Backend error: backend unavailable",
    })
  })
})
