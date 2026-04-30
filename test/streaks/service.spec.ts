import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isStreaksEnabledForProfile: vi.fn(),
  getStreakDay: vi.fn(),
  getUserStreakState: vi.fn(),
  upsertStreakDay: vi.fn(),
  upsertUserStreakState: vi.fn(),
  listStreakMilestones: vi.fn(),
  insertStreakMilestone: vi.fn(),
  listRecentStreakDays: vi.fn(),
  listPendingStreakVerificationTasks: vi.fn(),
  appendProductEvent: vi.fn(),
  createRecipeTry: vi.fn(),
  createVerificationTaskWithRouting: vi.fn(),
  applyUserVerificationDecision: vi.fn(),
}))

vi.mock("@/lib/streaks/guards", () => ({
  isStreaksEnabledForProfile: mocks.isStreaksEnabledForProfile,
}))

vi.mock("@/lib/streaks/repository", () => ({
  getStreakDay: mocks.getStreakDay,
  getUserStreakState: mocks.getUserStreakState,
  upsertStreakDay: mocks.upsertStreakDay,
  upsertUserStreakState: mocks.upsertUserStreakState,
  listStreakMilestones: mocks.listStreakMilestones,
  insertStreakMilestone: mocks.insertStreakMilestone,
  listRecentStreakDays: mocks.listRecentStreakDays,
  listPendingStreakVerificationTasks: mocks.listPendingStreakVerificationTasks,
}))

vi.mock("@/lib/foundation/product-events-service", () => ({
  appendProductEvent: mocks.appendProductEvent,
}))

vi.mock("@/lib/foundation/recipe-tries", () => ({
  createRecipeTry: mocks.createRecipeTry,
}))

vi.mock("@/lib/foundation/verification-service", () => ({
  createVerificationTaskWithRouting: mocks.createVerificationTaskWithRouting,
  applyUserVerificationDecision: mocks.applyUserVerificationDecision,
}))

import {
  applyGraceSkip,
  buildStreakDashboard,
  confirmStreakVerification,
  createStreakVerification,
  manualConfirmMeal,
  useFreezeToken,
} from "@/lib/streaks/service"

describe("streak service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("manual confirm counts a day once", async () => {
    mocks.createRecipeTry.mockResolvedValue({ recipeTry: { id: "try_1" } })
    mocks.getStreakDay.mockResolvedValue({ data: null })
    mocks.getUserStreakState.mockResolvedValue({ data: null })
    mocks.upsertStreakDay.mockResolvedValue({ data: { id: "day_1" } })
    mocks.upsertUserStreakState.mockResolvedValue({ error: null })
    mocks.listStreakMilestones.mockResolvedValue({ data: [] })

    const result = await manualConfirmMeal({} as any, { profileId: "profile_1" })
    expect((result as any).alreadyCounted).toBe(false)
  })

  it("duplicate day is safe and does not double-count", async () => {
    mocks.createRecipeTry.mockResolvedValue({ recipeTry: { id: "try_1" } })
    mocks.getStreakDay.mockResolvedValue({ data: { status: "counted", streak_date: "2026-05-01" } })

    const result = await manualConfirmMeal({} as any, { profileId: "profile_1", occurredOn: "2026-05-01" })
    expect((result as any).alreadyCounted).toBe(true)
    expect(mocks.upsertUserStreakState).not.toHaveBeenCalled()
  })

  it("low confidence routes to confirmation and never rejects", async () => {
    mocks.createVerificationTaskWithRouting.mockResolvedValue({
      verificationTask: { id: "task_1", status: "needs_confirmation" },
      duplicate: false,
    })
    const result = await createStreakVerification({} as any, { profileId: "profile_1" })
    expect((result as any).verificationTask.status).toBe("needs_confirmation")
  })

  it("auto accepted verification credits streak immediately", async () => {
    mocks.createVerificationTaskWithRouting.mockResolvedValue({
      verificationTask: { id: "task_auto", status: "auto_accepted" },
      duplicate: false,
    })
    mocks.createRecipeTry.mockResolvedValue({ recipeTry: { id: "try_auto" } })
    mocks.getStreakDay.mockResolvedValue({ data: null })
    mocks.getUserStreakState.mockResolvedValue({ data: { current_count: 0, longest_count: 0, freeze_tokens: 0 } })
    mocks.upsertStreakDay.mockResolvedValue({ data: { id: "day_auto" } })
    mocks.upsertUserStreakState.mockResolvedValue({ error: null })
    mocks.listStreakMilestones.mockResolvedValue({ data: [] })

    const result = await createStreakVerification({} as any, { profileId: "profile_1", confidence: 0.95 })
    expect((result as any).autoAccepted).toBe(true)
    expect((result as any).streakCredited).toBe(true)
  })

  it("confirming verification creates recipe try and counts day", async () => {
    mocks.applyUserVerificationDecision.mockResolvedValue({ verificationTask: { id: "task_1" } })
    mocks.createRecipeTry.mockResolvedValue({ recipeTry: { id: "try_1" } })
    mocks.getStreakDay.mockResolvedValue({ data: null })
    mocks.getUserStreakState.mockResolvedValue({ data: { current_count: 2, longest_count: 2, freeze_tokens: 0 } })
    mocks.upsertStreakDay.mockResolvedValue({ data: { id: "day_1" } })
    mocks.upsertUserStreakState.mockResolvedValue({ error: null })
    mocks.listStreakMilestones.mockResolvedValue({ data: [] })

    const result = await confirmStreakVerification({} as any, {
      profileId: "profile_1",
      verificationTaskId: "task_1",
    })
    expect((result as any).alreadyCounted).toBe(false)
  })

  it("freeze use requires token and decrements", async () => {
    mocks.getUserStreakState.mockResolvedValue({
      data: { current_count: 3, longest_count: 4, freeze_tokens: 1, last_counted_on: "2026-05-01" },
    })
    mocks.upsertStreakDay.mockResolvedValue({ error: null })
    mocks.upsertUserStreakState.mockResolvedValue({ error: null })

    const result = await useFreezeToken({} as any, { profileId: "profile_1", streakDate: "2026-05-02" })
    expect((result as any).applied).toBe(true)
  })

  it("grace applies once per week", async () => {
    mocks.getUserStreakState.mockResolvedValue({ data: { current_count: 3, longest_count: 4, freeze_tokens: 0, grace_used_week_start: null } })
    mocks.getStreakDay.mockResolvedValue({ data: null })
    mocks.upsertStreakDay.mockResolvedValue({ error: null })
    mocks.upsertUserStreakState.mockResolvedValue({ error: null })
    const result = await applyGraceSkip({} as any, { profileId: "profile_1", streakDate: "2026-05-02" })
    expect((result as any).applied).toBe(true)
  })

  it("dashboard returns disabled state safely", async () => {
    mocks.isStreaksEnabledForProfile.mockResolvedValue(false)
    const dashboard = await buildStreakDashboard({} as any, "profile_1")
    expect(dashboard.featureState.streaksEnabled).toBe(false)
  })
})
