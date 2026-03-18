import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "../route"

const { mockCreateCheckoutSession } = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
}))

vi.mock("@/app/api/checkout/route", () => ({
  POST: mockCreateCheckoutSession,
}))

describe("api/stripe/checkout legacy alias", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates POST to /api/checkout", async () => {
    const forwarded = Response.json({ url: "https://example.com/checkout" })
    mockCreateCheckoutSession.mockResolvedValue(forwarded)

    const request = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
    }) as any
    const res = await POST(request)

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(request)
    expect(res).toBe(forwarded)
  })

  it("redirects GET requests to /checkout while preserving query params", async () => {
    const request = new NextRequest("http://localhost/api/stripe/checkout?source=legacy")

    const res = await GET(request)

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost/checkout?source=legacy")
  })
})
