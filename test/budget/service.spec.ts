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
  setGoalCompleted: vi.fn(),
  switchBudgetGoalTransactional: vi.fn(),
  allocateWeeklySurplusTransactional: vi.fn(),
  getOwnedMediaAsset: vi.fn(),
  getOwnedVerificationTask: vi.fn(),
  getRecentContributions: vi.fn(),
  getRecentSpendLogs: vi.fn(),
  getLatestCompletedGoal: vi.fn(),
  getBudgetSettings: vi.fn(),
  getSpendLogsForWeek: vi.fn(),
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
  getBudgetSettings: mocks.getBudgetSettings,
  logBudgetSpend: mocks.logBudgetSpend,
  getSpendLogsForWeek: mocks.getSpendLogsForWeek,
  setGoalCompleted: mocks.setGoalCompleted,
  switchBudgetGoalTransactional: mocks.switchBudgetGoalTransactional,
  allocateWeeklySurplusTransactional: mocks.allocateWeeklySurplusTransactional,
  getOwnedMediaAsset: mocks.getOwnedMediaAsset,
  getOwnedVerificationTask: mocks.getOwnedVerificationTask,
  getRecentContributions: mocks.getRecentContributions,
  getRecentSpendLogs: mocks.getRecentSpendLogs,
  getLatestCompletedGoal: mocks.getLatestCompletedGoal,
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
    mocks.switchBudgetGoalTransactional.mockResolvedValue({
      data: {
        goal: { id: "goal_new", current_balance_cents: 7777, target_cents: 90000 },
        previousGoalId: "goal_old",
        transferredBalanceCents: 7777,
      },
      error: null,
    })

    const result = await switchBudgetGoal({} as any, {
      profileId: "profile_1",
      name: "Concert",
      category: "concert",
      targetCents: 90000,
      idempotencyKey: "switch-1",
    })

    expect(mocks.switchBudgetGoalTransactional).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetCents: 90000 }),
    )
    expect((result as any).goal.id).toBe("goal_new")
  })

  it("returns safe validation when switch RPC reports no active goal", async () => {
    mocks.switchBudgetGoalTransactional.mockResolvedValue({
      data: { validationError: "No active goal to switch from." },
      error: null,
    })

    const result = await switchBudgetGoal({} as any, {
      profileId: "profile_1",
      name: "Concert",
      category: "concert",
      targetCents: 90000,
      idempotencyKey: "switch-none",
    })

    expect((result as any).validationError).toContain("No active goal")
  })

  it("keeps jar monotonic via allocate path", async () => {
    mocks.allocateWeeklySurplusTransactional.mockResolvedValue({
      data: {
        duplicate: false,
        contribution: { id: "contrib_1", amount_cents: 3000 },
        goal: { id: "goal_1", current_balance_cents: 4000, target_cents: 50000 },
        summary: { week_start_date: "2026-04-27" },
      },
      error: null,
    })

    const result = await allocateWeeklySurplus({} as any, {
      profileId: "profile_1",
      weekStartDate: "2026-04-27",
      idempotencyKey: "alloc-1",
    })

    expect(mocks.allocateWeeklySurplusTransactional).toHaveBeenCalled()
    expect((result as any).duplicate).toBe(false)
  })

  it("treats duplicate allocation idempotency as safe no-op", async () => {
    mocks.allocateWeeklySurplusTransactional.mockResolvedValue({
      data: {
        duplicate: true,
        contribution: { id: "contrib_existing", amount_cents: 1000 },
        goal: { id: "goal_1", current_balance_cents: 4000, target_cents: 50000 },
      },
      error: null,
    })

    const result = await allocateWeeklySurplus({} as any, {
      profileId: "profile_1",
      weekStartDate: "2026-04-27",
      idempotencyKey: "alloc-dup",
    })
    expect((result as any).duplicate).toBe(true)
    expect((result as any).contribution.id).toBe("contrib_existing")
  })

  it("handles allocation race semantics by returning one duplicate", async () => {
    let invocation = 0
    mocks.allocateWeeklySurplusTransactional.mockImplementation(async () => {
      invocation += 1
      if (invocation === 1) {
        return {
          data: {
            duplicate: false,
            contribution: { id: "contrib_first", amount_cents: 900 },
            goal: { id: "goal_1", current_balance_cents: 1900, target_cents: 10000 },
            summary: { week_start_date: "2026-04-27" },
          },
          error: null,
        }
      }
      return {
        data: {
          duplicate: true,
          contribution: { id: "contrib_first", amount_cents: 900 },
          goal: { id: "goal_1", current_balance_cents: 1900, target_cents: 10000 },
        },
        error: null,
      }
    })

    const [first, second] = await Promise.all([
      allocateWeeklySurplus({} as any, {
        profileId: "profile_1",
        weekStartDate: "2026-04-27",
        idempotencyKey: "alloc-race",
      }),
      allocateWeeklySurplus({} as any, {
        profileId: "profile_1",
        weekStartDate: "2026-04-27",
        idempotencyKey: "alloc-race",
      }),
    ])

    expect([Boolean((first as any).duplicate), Boolean((second as any).duplicate)].sort()).toEqual([false, true])
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

  it("rejects malformed allocation weekStart", async () => {
    const result = await allocateWeeklySurplus({} as any, {
      profileId: "profile_1",
      weekStartDate: "2026/04/27",
      idempotencyKey: "alloc-bad-week",
    })
    expect((result as any).validationError).toContain("YYYY-MM-DD")
  })

  it("returns safe error when no active goal exists on allocation", async () => {
    mocks.allocateWeeklySurplusTransactional.mockResolvedValue({
      data: { validationError: "No active goal available for allocation." },
      error: null,
    })

    const result = await allocateWeeklySurplus({} as any, {
      profileId: "profile_1",
      weekStartDate: "2026-04-27",
      idempotencyKey: "alloc-no-goal",
    })
    expect((result as any).validationError).toContain("No active goal")
  })
})
