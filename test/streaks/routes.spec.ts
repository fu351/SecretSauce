import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthenticatedProfile: vi.fn(),
  assertStreaksEnabled: vi.fn(),
  buildStreakDashboard: vi.fn(),
  manualConfirmMeal: vi.fn(),
  createStreakVerification: vi.fn(),
}))

vi.mock("@/lib/foundation/server", () => ({
  getAuthenticatedProfile: mocks.getAuthenticatedProfile,
}))

vi.mock("@/lib/streaks/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/streaks/service")>("@/lib/streaks/service")
  return {
    ...actual,
    assertStreaksEnabled: mocks.assertStreaksEnabled,
    buildStreakDashboard: mocks.buildStreakDashboard,
    manualConfirmMeal: mocks.manualConfirmMeal,
    createStreakVerification: mocks.createStreakVerification,
  }
})

import { GET as dashboardGet } from "@/app/api/streaks/dashboard/route"
import { POST as manualPost } from "@/app/api/streaks/manual-confirm/route"
import { POST as verificationCreatePost } from "@/app/api/streaks/verification/create/route"

describe("streak routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects unauthenticated writes", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" })
    const response = await manualPost(new Request("http://localhost/api/streaks/manual-confirm", { method: "POST" }))
    expect(response.status).toBe(401)
  })

  it("blocks writes when feature is disabled", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_1", supabase: {} })
    mocks.assertStreaksEnabled.mockResolvedValue(false)
    const response = await verificationCreatePost(new Request("http://localhost/api/streaks/verification/create", { method: "POST" }))
    expect(response.status).toBe(403)
  })

  it("loads dashboard for authenticated users", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_1", supabase: {} })
    mocks.buildStreakDashboard.mockResolvedValue({ featureState: { streaksEnabled: true } })
    const response = await dashboardGet()
    expect(response.status).toBe(200)
  })

  it("ignores client-supplied profile id", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertStreaksEnabled.mockResolvedValue(true)
    mocks.manualConfirmMeal.mockResolvedValue({ alreadyCounted: false })
    const response = await manualPost(
      new Request("http://localhost/api/streaks/manual-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "profile_client" }),
      }),
    )
    expect(response.status).toBe(200)
    expect(mocks.manualConfirmMeal).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server" }),
    )
  })
})
