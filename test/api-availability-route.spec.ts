import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  runFrontendScraperApiProcessor: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock("@/backend/orchestrators/frontend-scraper-pipeline/pipeline", () => ({
  runFrontendScraperApiProcessor: mocks.runFrontendScraperApiProcessor,
}))

import {
  DELETE,
  GET as availabilityGet,
  PATCH,
} from "@/app/api/dev/api-availability/route"
import { GET as grocerySearchGet } from "@/app/api/grocery-search/route"
import { resetApiAvailability, setApiAvailability } from "@/lib/dev/api-availability"

function jsonPatch(body: unknown): Request {
  return new Request("http://localhost/api/dev/api-availability", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("dev API availability toggles", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    resetApiAvailability()
    mocks.requireAdmin.mockResolvedValue(undefined)
    mocks.runFrontendScraperApiProcessor.mockResolvedValue({
      status: 200,
      body: { ok: true },
    })
  })

  afterEach(() => {
    resetApiAvailability()
    infoSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it("lists configured API availability targets for admins", async () => {
    const response = await availabilityGet()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.apis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "grocery-search",
          enabled: true,
          path: "/api/grocery-search",
        }),
      ])
    )
  })

  it("updates and resets API availability", async () => {
    const disabled = await PATCH(jsonPatch({ key: "grocery-search", enabled: false }))
    expect(disabled.status).toBe(200)
    expect(infoSpy).toHaveBeenCalledWith("[ApiAvailability]", "set", {
      api: "grocery-search",
      enabled: false,
    })
    await expect(disabled.json()).resolves.toEqual(
      expect.objectContaining({
        apis: expect.arrayContaining([
          expect.objectContaining({ key: "grocery-search", enabled: false }),
        ]),
      })
    )

    const reset = await DELETE()
    expect(reset.status).toBe(200)
    expect(infoSpy).toHaveBeenCalledWith("[ApiAvailability]", "reset", {
      restoredApis: ["grocery-search"],
    })
    await expect(reset.json()).resolves.toEqual(
      expect.objectContaining({
        apis: expect.arrayContaining([
          expect.objectContaining({ key: "grocery-search", enabled: true }),
        ]),
      })
    )
  })

  it("rejects invalid toggle keys", async () => {
    const response = await PATCH(jsonPatch({ key: "not-real", enabled: false }))

    expect(response.status).toBe(400)
  })

  it("short-circuits disabled guarded APIs before calling their processor", async () => {
    setApiAvailability("grocery-search", false)

    const response = await grocerySearchGet(
      new Request("http://localhost/api/grocery-search?q=rice") as any
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "Grocery search is temporarily disabled by dev tools.",
      code: "API_DISABLED",
      api: "grocery-search",
    })
    expect(warnSpy).toHaveBeenCalledWith("[ApiAvailability]", "blocked", {
      api: "grocery-search",
    })
    expect(mocks.runFrontendScraperApiProcessor).not.toHaveBeenCalled()
  })

  it("does not log no-op availability writes", async () => {
    const response = await PATCH(jsonPatch({ key: "grocery-search", enabled: true }))

    expect(response.status).toBe(200)
    expect(infoSpy).not.toHaveBeenCalled()
  })
})
