import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function makeRequest(query: string) {
  return new Request(`http://localhost/api/ingredients/swaps${query}`) as any
}

describe("GET /api/ingredients/swaps", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env.PYTHON_SERVICE_URL = "https://python.example.com/"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.PYTHON_SERVICE_URL
  })

  it("returns 400 when ingredient is missing", async () => {
    const { GET } = await import("../route")
    const response = await GET(makeRequest(""))
    expect(response.status).toBe(400)
  })

  it("returns ranked swaps from the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            { ingredient: "turkey", token: "turkey", score: 1.05 },
            { ingredient: "chicken", token: "chicken", score: 2.0 },
            { ingredient: "pork", token: "pork", score: 0.98 },
          ],
          error: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const { GET } = await import("../route")
    const response = await GET(makeRequest("?ingredient=chicken&limit=2"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    // self is filtered out and limit applied
    expect(body.data.map((r: any) => r.token)).toEqual(["turkey", "pork"])
  })

  it("honors the exclude query param", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { ingredient: "turkey", token: "turkey", score: 1.05 },
              { ingredient: "pork", token: "pork", score: 0.98 },
            ],
            error: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )

    const { GET } = await import("../route")
    const response = await GET(makeRequest("?ingredient=chicken&exclude=pork"))
    const body = await response.json()
    expect(body.data.map((r: any) => r.token)).toEqual(["turkey"])
  })

  it("returns 503 when the python service is not configured", async () => {
    delete process.env.PYTHON_SERVICE_URL
    const { GET } = await import("../route")
    const response = await GET(makeRequest("?ingredient=chicken"))
    expect(response.status).toBe(503)
  })

  it("returns 502 when the backend errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })))
    const { GET } = await import("../route")
    const response = await GET(makeRequest("?ingredient=chicken"))
    expect(response.status).toBe(502)
  })
})
