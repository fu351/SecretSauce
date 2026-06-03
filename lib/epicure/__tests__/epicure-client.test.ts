import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("epicure-client", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env.PYTHON_SERVICE_URL = "https://python.example.com/"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.PYTHON_SERVICE_URL
  })

  it("requests the swap endpoint and unwraps the data envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: [{ ingredient: "turkey", token: "turkey", score: 1.05 }], error: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const { getEpicureSwaps } = await import("../epicure-client")
    const result = await getEpicureSwaps("chicken", { k: 5 })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("https://python.example.com/epicure/swap")
    expect(calledUrl).toContain("ingredient=chicken")
    expect(calledUrl).toContain("k=5")
    expect(result).toEqual([{ ingredient: "turkey", token: "turkey", score: 1.05 }])
  })

  it("filters out malformed elements from the data array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            { ingredient: "turkey", token: "turkey", score: 1.05 },
            { ingredient: "bad", token: "bad" }, // missing score
            null,
            { token: "x", score: 1 }, // missing ingredient
          ],
          error: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const { getEpicureSwaps } = await import("../epicure-client")
    const result = await getEpicureSwaps("chicken", {})
    expect(result).toEqual([{ ingredient: "turkey", token: "turkey", score: 1.05 }])
  })

  it("throws EpicureUnavailableError when the service URL is not configured", async () => {
    delete process.env.PYTHON_SERVICE_URL
    const { getEpicureSwaps, EpicureUnavailableError } = await import("../epicure-client")
    await expect(getEpicureSwaps("chicken", {})).rejects.toBeInstanceOf(EpicureUnavailableError)
  })

  it("throws when the backend returns a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })))
    const { getEpicureSwaps } = await import("../epicure-client")
    await expect(getEpicureSwaps("chicken", {})).rejects.toThrow()
  })

  // Regression: a non-object (array/scalar) 2xx body was silently coerced to []
  // before the envelope was validated at the boundary.
  it("throws when the 2xx body is not an object envelope (array)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )
    const { getEpicureSwaps, EpicureRequestError } = await import("../epicure-client")
    await expect(getEpicureSwaps("chicken", {})).rejects.toBeInstanceOf(EpicureRequestError)
  })

  // Regression: NaN/Infinity scores (e.g. 1e999 -> Infinity via JSON.parse) used to
  // pass the boundary guard and could poison ranking math.
  it("drops suggestions with a non-finite score", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '{"success":true,"data":[{"ingredient":"inf","token":"inf","score":1e999},{"ingredient":"ok","token":"ok","score":0.5}],"error":null}',
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )
    const { getEpicureSwaps } = await import("../epicure-client")
    const result = await getEpicureSwaps("chicken", {})
    expect(result).toEqual([{ ingredient: "ok", token: "ok", score: 0.5 }])
  })

  it("requests the neighbors endpoint with k and model params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: [{ ingredient: "turkey", token: "turkey", score: 0.7 }], error: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const { getEpicureNeighbors } = await import("../epicure-client")
    const result = await getEpicureNeighbors("chicken", { k: 3, model: "chem" })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("https://python.example.com/epicure/neighbors")
    expect(calledUrl).toContain("ingredient=chicken")
    expect(calledUrl).toContain("k=3")
    expect(calledUrl).toContain("model=chem")
    expect(result).toEqual([{ ingredient: "turkey", token: "turkey", score: 0.7 }])
  })

  it("throws when the backend returns a 2xx body that is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>not json</html>", { status: 200, headers: { "Content-Type": "text/html" } })
      )
    )
    const { getEpicureSwaps, EpicureRequestError } = await import("../epicure-client")
    await expect(getEpicureSwaps("chicken", {})).rejects.toBeInstanceOf(EpicureRequestError)
  })

  it("throws when the envelope reports success: false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, data: null, error: "model down" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )
    const { getEpicureSwaps } = await import("../epicure-client")
    await expect(getEpicureSwaps("chicken", {})).rejects.toThrow("model down")
  })

  it("posts to the cuisine-blend endpoint with a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [], error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { getEpicureCuisineBlend } = await import("../epicure-client")
    await getEpicureCuisineBlend({ ingredient: "chicken", cuisine: "South Asian", thetaDeg: 30, k: 5 })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://python.example.com/epicure/cuisine-blend",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient: "chicken", cuisine: "South Asian", theta_deg: 30, k: 5 }),
      })
    )
  })
})
