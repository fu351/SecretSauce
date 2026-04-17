import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockRunFrontendScraperApiProcessor } = vi.hoisted(() => ({
  mockRunFrontendScraperApiProcessor: vi.fn(),
}))

vi.mock("@/backend/orchestrators/frontend-scraper-pipeline/pipeline", () => ({
  runFrontendScraperApiProcessor: mockRunFrontendScraperApiProcessor,
}))

import { GET } from "../route"

describe("GET /api/grocery-search", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes the request URL to the frontend scraper processor and returns its payload", async () => {
    mockRunFrontendScraperApiProcessor.mockResolvedValue({
      status: 207,
      body: { ok: true, items: ["milk"] },
    })

    const request = new Request("http://localhost/api/grocery-search?term=milk")
    const response = await GET(request as any)

    expect(mockRunFrontendScraperApiProcessor).toHaveBeenCalledWith(request.url)
    expect(response.status).toBe(207)
    expect(await response.json()).toEqual({ ok: true, items: ["milk"] })
  })
})
