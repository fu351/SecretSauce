import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getActiveBudgetGoal: vi.fn(),
  ensureBudgetSettings: vi.fn(),
  createBudgetGoal: vi.fn(),
  archiveGoal: vi.fn(),
  logBudgetSpend: vi.fn(),
  getWeeklySummary: vi.fn(),
  insertContribution: vi.fn(),
  updateGoalBalance: vi.fn(),
  upsertWeeklySummary: vi.fn(),
  appendProductEvent: vi.fn(),
}))

vi.mock("@/lib/budget/repository", () => ({
  getActiveBudgetGoal: mocks.getActiveBudgetGoal,
  upsertBudgetSettings: mocks.ensureBudgetSettings,
  createBudgetGoal: mocks.createBudgetGoal,
  archiveGoal: mocks.archiveGoal,
  getWeeklySummary: mocks.getWeeklySummary,
  insertContribution: mocks.insertContribution,
  updateGoalBalance: mocks.updateGoalBalance,
  upsertWeeklySummary: mocks.upsertWeeklySummary,
  getBudgetSettings: vi.fn(),
  logBudgetSpend: mocks.logBudgetSpend,
  getSpendLogsForWeek: vi.fn(),
}))

vi.mock("@/lib/foundation/product-events-service", () => ({
  appendProductEvent: mocks.appendProductEvent,
}))

import { allocateWeeklySurplus, createFirstBudgetGoal, logBudgetSpendEntry, switchBudgetGoal } from "@/lib/budget/service"

describe("budget service invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("enforces one active goal invariant", async () => {
    mocks.getActiveBudgetGoal.mockResolvedValue({
      id: "goal_1",
      currentBalanceCents: 4000,
    })

    const result = await createFirstBudgetGoal({} as any, {
      profileId: "profile_1",
      name: "Trip",
      category: "travel",
      targetCents: 50000,
      weeklyBudgetCents: 10000,
    })

    expect((result as any).validationError).toBeTruthy()
    expect(mocks.createBudgetGoal).not.toHaveBeenCalled()
  })

  it("switches goal and transfers full balance", async () => {
    mocks.getActiveBudgetGoal.mockResolvedValue({
      id: "goal_old",
      currentBalanceCents: 7777,
    })
    mocks.createBudgetGoal.mockResolvedValue({
      data: { id: "goal_new", current_balance_cents: 7777 },
      error: null,
    })
    mocks.archiveGoal.mockResolvedValue({ error: null })

    const result = await switchBudgetGoal({} as any, {
      profileId: "profile_1",
      name: "Concert",
      category: "concert",
      targetCents: 90000,
      idempotencyKey: "switch-1",
    })

    expect(mocks.createBudgetGoal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ balanceCents: 7777 }),
    )
    expect((result as any).goal.id).toBe("goal_new")
  })

  it("keeps jar monotonic via allocate path", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      })),
    }
    mocks.getWeeklySummary.mockResolvedValue({
      data: {
        id: "summary_1",
        week_start_date: "2026-04-27",
        week_end_date: "2026-05-03",
        weekly_budget_cents: 10000,
        manual_spend_cents: 2000,
        receipt_spend_cents: 2000,
        tracked_spend_cents: 4000,
        raw_surplus_cents: 6000,
        bankable_surplus_cents: 3000,
        cap_applied: true,
        status: "ready_to_allocate",
      },
    })
    mocks.getActiveBudgetGoal.mockResolvedValue({
      id: "goal_1",
      currentBalanceCents: 1000,
      targetCents: 50000,
    })
    mocks.updateGoalBalance.mockResolvedValue({
      data: { id: "goal_1", current_balance_cents: 4000 },
      error: null,
    })
    mocks.insertContribution.mockResolvedValue({ data: { id: "contrib_1" }, error: null })
    mocks.upsertWeeklySummary.mockResolvedValue({ data: { id: "summary_1" }, error: null })

    const result = await allocateWeeklySurplus(supabase as any, {
      profileId: "profile_1",
      weekStartDate: "2026-04-27",
      idempotencyKey: "alloc-1",
    })

    expect(mocks.updateGoalBalance).toHaveBeenCalledWith(expect.anything(), "profile_1", "goal_1", 4000)
    expect((supabase.from as any).mock.calls.some((call: unknown[]) => call[0] === "social_activity_projections")).toBe(
      false,
    )
    expect((result as any).duplicate).toBe(false)
  })

  it("treats duplicate allocation idempotency as safe no-op", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "contrib_existing" }, error: null }),
            }),
          }),
        }),
      })),
    }

    const result = await allocateWeeklySurplus(supabase as any, {
      profileId: "profile_1",
      weekStartDate: "2026-04-27",
      idempotencyKey: "alloc-dup",
    })
    expect((result as any).duplicate).toBe(true)
    expect((result as any).contribution.id).toBe("contrib_existing")
  })

  it("emits nudge recovery when contribution happens within 7 days", async () => {
    mocks.logBudgetSpend.mockResolvedValue({
      data: { id: "log_1" },
      error: null,
    })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "budget_nudge_state") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    last_nudge_shown_at: "2026-05-01T00:00:00.000Z",
                    last_nudge_recovered_at: null,
                  },
                  error: null,
                }),
              }),
            }),
            upsert: async () => ({ data: null, error: null }),
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          }
        }
        return {}
      }),
    }

    await logBudgetSpendEntry(supabase as any, {
      profileId: "profile_1",
      amountCents: 1000,
      sourceType: "manual",
      occurredAt: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "spend-1",
    })

    expect(
      mocks.appendProductEvent.mock.calls.some((call) => call[2]?.eventType === "budget.nudge_recovered"),
    ).toBe(true)
  })
})
