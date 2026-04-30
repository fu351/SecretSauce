import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockGetAuthenticatedProfile, mockUpdate } = vi.hoisted(() => ({
  mockGetAuthenticatedProfile: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock("@/lib/foundation/server", () => ({
  getAuthenticatedProfile: mockGetAuthenticatedProfile,
}))

vi.mock("@/lib/foundation/preferences-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/foundation/preferences-service")>(
    "@/lib/foundation/preferences-service",
  )
  return {
    ...actual,
    updateUserFeaturePreferences: mockUpdate,
  }
})

import { PATCH } from "@/app/api/foundation/preferences/route"

describe("foundation preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects unauthenticated writes", async () => {
    mockGetAuthenticatedProfile.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" })
    const req = new Request("http://localhost/api/foundation/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socialEnabled: true }),
    })
    const response = await PATCH(req)
    expect(response.status).toBe(401)
  })

  it("rejects client-supplied profile identifiers as writable fields", async () => {
    mockGetAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mockUpdate.mockResolvedValue({ validationError: "No valid preference fields to update" })

    const req = new Request("http://localhost/api/foundation/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: "profile_client", profileId: "profile_client", userId: "x" }),
    })
    const response = await PATCH(req)
    expect(response.status).toBe(400)
  })
})
