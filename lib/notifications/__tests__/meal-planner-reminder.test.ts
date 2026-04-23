import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendWeeklyMealPlannerReminders } from "../meal-planner-reminder"

function createProfilesChain(rows: any[]) {
  const result = { data: rows, error: null }
  const eqResult: any = {
    maybeSingle: vi.fn(() => Promise.resolve(rows[0] ? { data: rows[0], error: null } : { data: null, error: null })),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => eqResult),
  }
  return chain
}

function createScheduleChain(rows: any[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  }
  return chain
}

function createReminderLogsChain(
  resultLookup: any,
  resultInsert: any,
  resultUpdate: any
) {
  const updateChain: any = {
    eq: vi.fn(() => Promise.resolve(resultUpdate)),
  }

  const insertChain: any = {
    select: vi.fn(() => insertChain),
    single: vi.fn(() => Promise.resolve(resultInsert)),
  }

  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(resultLookup)),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
  }

  return chain
}

describe("sendWeeklyMealPlannerReminders", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" })
    global.fetch = fetchMock as unknown as typeof fetch
    process.env.RESEND_API_KEY = "test-resend-key"
    process.env.NOTIFICATIONS_FROM_EMAIL = "notifications@secretsauce.test"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.secretsauce.test"
  })

  it("sends a weekly reminder for enabled users and summarizes their plan", async () => {
    const now = new Date("2026-04-22T15:00:00.000Z")
    const profiles = [
      {
        id: "user_1",
        email: "chef@example.com",
        full_name: "Chef One",
        meal_planner_weekly_reminder_enabled: true,
      },
      {
        id: "user_2",
        email: "quiet@example.com",
        full_name: "Quiet Cook",
        meal_planner_weekly_reminder_enabled: false,
      },
    ]
    const mealSchedule = [
      {
        user_id: "user_1",
        date: "2026-04-20",
        meal_type: "breakfast",
      },
      {
        user_id: "user_1",
        date: "2026-04-20",
        meal_type: "dinner",
      },
      {
        user_id: "user_1",
        date: "2026-04-21",
        meal_type: "lunch",
      },
      {
        user_id: "user_2",
        date: "2026-04-21",
        meal_type: "dinner",
      },
    ]

    const profilesChain = createProfilesChain(profiles)
    const scheduleChain = createScheduleChain(mealSchedule)
    const reminderLogChain = createReminderLogsChain(
      { data: null, error: null },
      { data: { id: "reminder_1" }, error: null },
      { data: null, error: null }
    )

    const db = {
      from: vi.fn((table: string) => {
        if (table === "profiles") return profilesChain
        if (table === "meal_schedule") return scheduleChain
        if (table === "meal_planner_weekly_reminders") return reminderLogChain
        throw new Error(`Unexpected table ${table}`)
      }),
    } as any

    const summary = await sendWeeklyMealPlannerReminders(db, { now })

    expect(summary).toEqual({ recipientsProcessed: 1, remindersSent: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, requestInit] = fetchMock.mock.calls[0]
    expect(String(requestInit.body)).toContain("Plan your meals for this week")
    expect(String(requestInit.body)).toContain("chef@example.com")
    expect(String(requestInit.body)).toContain("Breakfast: 1")
    expect(String(requestInit.body)).toContain("Lunch: 1")
    expect(String(requestInit.body)).toContain("Dinner: 1")
    expect(scheduleChain.gte).toHaveBeenCalledWith("date", "2026-04-20")
    expect(scheduleChain.lte).toHaveBeenCalledWith("date", "2026-04-26")
  })

  it("skips sending when the reminder already has a sent log", async () => {
    const now = new Date("2026-04-22T15:00:00.000Z")
    const profiles = [
      {
        id: "user_1",
        email: "chef@example.com",
        full_name: "Chef One",
        meal_planner_weekly_reminder_enabled: true,
      },
    ]
    const mealSchedule: any[] = []

    const profilesChain = createProfilesChain(profiles)
    const scheduleChain = createScheduleChain(mealSchedule)
    const reminderLogChain = createReminderLogsChain(
      { data: { id: "reminder_1", sent_at: "2026-04-21T00:00:00.000Z" }, error: null },
      { data: null, error: null },
      { data: null, error: null }
    )

    const db = {
      from: vi.fn((table: string) => {
        if (table === "profiles") return profilesChain
        if (table === "meal_schedule") return scheduleChain
        if (table === "meal_planner_weekly_reminders") return reminderLogChain
        throw new Error(`Unexpected table ${table}`)
      }),
    } as any

    const summary = await sendWeeklyMealPlannerReminders(db, { now })

    expect(summary).toEqual({ recipientsProcessed: 1, remindersSent: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
