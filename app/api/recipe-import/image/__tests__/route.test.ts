import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("POST /api/recipe-import/image", () => {
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

  it("returns 400 when OCR text is missing or too short", async () => {
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "too short" }),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: "OCR text is too short or empty",
    })
  })

  it("returns 500 when the Python service URL is not configured", async () => {
    delete process.env.PYTHON_SERVICE_URL
    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "This is a sufficiently long OCR body for parsing." }),
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      success: false,
      error: "Python service URL not configured",
    })
  })

  it("forwards OCR text to the backend with source_type=image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, title: "Image Recipe" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "This is a sufficiently long OCR body for parsing." }),
      }) as any
    )

    expect(fetchMock).toHaveBeenCalledWith("https://python.example.com/recipe-import/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "This is a sufficiently long OCR body for parsing.",
        source_type: "image",
      }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, title: "Image Recipe" })
  })

  it("returns backend error details when parsing fails upstream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("parse failed", {
          status: 422,
        })
      )
    )

    const { POST } = await import("../route")

    const response = await POST(
      new Request("http://localhost/api/recipe-import/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "This is a sufficiently long OCR body for parsing." }),
      }) as any
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      success: false,
      error: "Backend error: parse failed",
    })
  })
})
