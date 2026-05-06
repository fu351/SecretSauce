import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runFrontendBatchScraperPipeline: vi.fn(),
}))

vi.mock("@/backend/orchestrators/frontend-batch-scraper-pipeline/pipeline", () => ({
  runFrontendBatchScraperPipeline: mocks.runFrontendBatchScraperPipeline,
}))

import { POST } from "@/app/api/batch-scraper/route"

const originalCronSecret = process.env.CRON_SECRET

function batchPost(secret: string | undefined) {
  return new Request("http://localhost/api/batch-scraper", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      ingredients: ["rice"],
      zipCode: "94103",
    }),
  })
}

describe("batch scraper route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runFrontendBatchScraperPipeline.mockResolvedValue({
      summary: { successful: 1 },
      results: [],
      zipCode: "94103",
    })
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  it("fails closed when CRON_SECRET is not configured", async () => {
    process.env.CRON_SECRET = ""

    const response = await POST(batchPost("undefined") as any)

    expect(response.status).toBe(503)
    expect(mocks.runFrontendBatchScraperPipeline).not.toHaveBeenCalled()
  })

  it("accepts the configured CRON_SECRET", async () => {
    process.env.CRON_SECRET = "secret_1"

    const response = await POST(batchPost("secret_1") as any)

    expect(response.status).toBe(200)
    expect(mocks.runFrontendBatchScraperPipeline).toHaveBeenCalled()
  })
})
