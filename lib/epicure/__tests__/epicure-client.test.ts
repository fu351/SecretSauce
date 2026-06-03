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
