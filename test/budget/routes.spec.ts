import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthenticatedProfile: vi.fn(),
  assertBudgetEnabled: vi.fn(),
  logBudgetSpendEntry: vi.fn(),
  buildBudgetDashboard: vi.fn(),
  computePendingWeeklySummaries: vi.fn(),
  allocateWeeklySurplus: vi.fn(),
  createSocialActivityProjection: vi.fn(),
}))

vi.mock("@/lib/foundation/server", () => ({
  getAuthenticatedProfile: mocks.getAuthenticatedProfile,
}))

vi.mock("@/lib/budget/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/budget/service")>("@/lib/budget/service")
  return {
    ...actual,
    assertBudgetEnabled: mocks.assertBudgetEnabled,
    logBudgetSpendEntry: mocks.logBudgetSpendEntry,
    buildBudgetDashboard: mocks.buildBudgetDashboard,
    computePendingWeeklySummaries: mocks.computePendingWeeklySummaries,
    allocateWeeklySurplus: mocks.allocateWeeklySurplus,
  }
})

import { POST as spendPost } from "@/app/api/budget/spend/route"
import { GET as dashboardGet } from "@/app/api/budget/dashboard/route"
import { POST as allocatePost } from "@/app/api/budget/weeks/[weekStart]/allocate/route"

describe("budget routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects unauthenticated writes", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" })
    const response = await spendPost(
      new Request("http://localhost/api/budget/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: 1000, sourceType: "manual" }),
      }),
    )
    expect(response.status).toBe(401)
  })

  it("blocks writes when budget feature is disabled", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertBudgetEnabled.mockResolvedValue(false)
    const response = await spendPost(
      new Request("http://localhost/api/budget/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: 1000, sourceType: "manual" }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it("ignores client-supplied profile id and writes with authenticated profile", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertBudgetEnabled.mockResolvedValue(true)
    mocks.logBudgetSpendEntry.mockResolvedValue({ spendLog: { id: "log_1" }, duplicate: false })

    const response = await spendPost(
      new Request("http://localhost/api/budget/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: "profile_client",
          userId: "user_client",
          amountCents: 1000,
          sourceType: "manual",
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(mocks.logBudgetSpendEntry).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server" }),
    )
  })

  it("loads dashboard for authenticated enabled user", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_1", supabase: {} })
    mocks.assertBudgetEnabled.mockResolvedValue(true)
    mocks.computePendingWeeklySummaries.mockResolvedValue({ summaries: [] })
    mocks.buildBudgetDashboard.mockResolvedValue({ activeGoal: null })

    const response = await dashboardGet()
    expect(response.status).toBe(200)
  })

  it("returns disabled dashboard shape instead of failing", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_1", supabase: {} })
    mocks.assertBudgetEnabled.mockResolvedValue(false)

    const response = await dashboardGet()
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.dashboard.featureState.budgetTrackingEnabled).toBe(false)
  })

  it("rejects malformed weekStart allocation route params", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_1", supabase: {} })
    mocks.assertBudgetEnabled.mockResolvedValue(true)

    const response = await allocatePost(
      new Request("http://localhost/api/budget/weeks/invalid/allocate", { method: "POST" }),
      { params: Promise.resolve({ weekStart: "invalid" }) } as any,
    )
    expect(response.status).toBe(400)
  })
})
