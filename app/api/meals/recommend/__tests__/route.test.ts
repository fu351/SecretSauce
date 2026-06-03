import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/epicure/epicure-client", async () => {
  const actual = await vi.importActual<any>("@/lib/epicure/epicure-client")
  return { ...actual, getEpicureNeighbors: vi.fn() }
})
vi.mock("@/lib/epicure/recipe-candidates", () => ({ fetchRecipeCandidates: vi.fn() }))

import { EpicureUnavailableError, getEpicureNeighbors } from "@/lib/epicure/epicure-client"
import { fetchRecipeCandidates } from "@/lib/epicure/recipe-candidates"

function postRequest(body: unknown) {
  return new Request("http://localhost/api/meals/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any
}

describe("POST /api/meals/recommend", () => {
  beforeEach(() => {
    process.env.PYTHON_SERVICE_URL = "https://python.example.com"
  })
  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.PYTHON_SERVICE_URL
  })

  it("returns 400 when seedIngredients is empty", async () => {
    const { POST } = await import("../route")
    const response = await POST(postRequest({ seedIngredients: [] }))
    expect(response.status).toBe(400)
  })

  it("ranks candidate recipes by ingredient affinity to the seeds", async () => {
    ;(getEpicureNeighbors as any).mockResolvedValue([
      { ingredient: "pork", token: "pork", score: 0.58 },
      { ingredient: "beef", token: "beef", score: 0.57 },
    ])
    ;(fetchRecipeCandidates as any).mockResolvedValue([
      { id: "a", title: "Pork stew", ingredientTokens: ["pork", "onion"] },
      { id: "b", title: "Tofu salad", ingredientTokens: ["tofu", "lettuce"] },
    ])

    const { POST } = await import("../route")
    const response = await POST(postRequest({ seedIngredients: ["chicken"], limit: 5 }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.map((r: any) => r.id)).toEqual(["a"])
    expect(getEpicureNeighbors).toHaveBeenCalledWith("chicken", expect.any(Object))
  })

  it("returns 400 when seedIngredients exceeds the cap (fan-out guard)", async () => {
    const { POST } = await import("../route")
    const tooMany = Array.from({ length: 21 }, (_, i) => `ingredient_${i}`)
    const response = await POST(postRequest({ seedIngredients: tooMany }))
    expect(response.status).toBe(400)
    expect(getEpicureNeighbors).not.toHaveBeenCalled()
  })

  it("returns 503 when the epicure service is unavailable", async () => {
    ;(getEpicureNeighbors as any).mockRejectedValue(new EpicureUnavailableError())
    const { POST } = await import("../route")
    const response = await POST(postRequest({ seedIngredients: ["chicken"] }))
    expect(response.status).toBe(503)
  })

  // Regression: timeouts (AbortError) were misclassified as 502 before review.
  it("returns 504 when an upstream call times out (AbortError)", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" })
    ;(getEpicureNeighbors as any).mockRejectedValue(abortError)
    const { POST } = await import("../route")
    const response = await POST(postRequest({ seedIngredients: ["chicken"] }))
    expect(response.status).toBe(504)
  })
})
