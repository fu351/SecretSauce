import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendWeeklyNotificationDigests } from "../notification-service"

function createNotificationsChain(rows: any[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  }
  return chain
}

function createDigestTable(resultLookup: any, resultInsert: any, resultUpdate: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(resultLookup)),
    insert: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resultInsert)),
    update: vi.fn(() => chain),
  }

  chain.eq.mockImplementation(() => {
    if (chain.update.mock.calls.length > 0) {
      return Promise.resolve(resultUpdate)
    }
    return chain
  })

  return chain
}

describe("sendWeeklyNotificationDigests", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" })
    global.fetch = fetchMock as unknown as typeof fetch
    process.env.RESEND_API_KEY = "test-resend-key"
    process.env.NOTIFICATIONS_FROM_EMAIL = "notifications@secretsauce.test"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.secretsauce.test"
  })

  it("groups unread notifications by recipient and skips opted-out users", async () => {
    const now = new Date("2026-04-22T15:00:00.000Z")
    const notifications = [
      {
        id: "n_1",
        recipient_id: "recipient_1",
        actor_id: "actor_1",
        type: "post_like",
        entity_type: "post",
        entity_id: "post_1",
        title: "Dinner",
        body: null,
        payload: { post_id: "post_1", post_title: "Dinner" },
        read_at: null,
        created_at: "2026-04-20T12:00:00.000Z",
        recipient: {
          id: "recipient_1",
          email: "chef@example.com",
          full_name: "Chef One",
          notification_email_digest_enabled: true,
        },
        actor: {
          id: "actor_1",
          full_name: "Taylor Taste",
          avatar_url: null,
          username: "taylor",
        },
      },
      {
        id: "n_2",
        recipient_id: "recipient_1",
        actor_id: "actor_2",
        type: "post_repost",
        entity_type: "post",
        entity_id: "post_2",
        title: "Soup",
        body: null,
        payload: { post_id: "post_2", post_title: "Soup" },
        read_at: null,
        created_at: "2026-04-21T12:00:00.000Z",
        recipient: {
          id: "recipient_1",
          email: "chef@example.com",
          full_name: "Chef One",
          notification_email_digest_enabled: true,
        },
        actor: {
          id: "actor_2",
          full_name: "Pat Plate",
          avatar_url: null,
          username: "pat",
        },
      },
      {
        id: "n_3",
        recipient_id: "recipient_2",
        actor_id: "actor_3",
        type: "follow_request",
        entity_type: "follow_request",
        entity_id: "req_1",
        title: "Follow request",
        body: null,
        payload: { requestId: "req_1" },
        read_at: null,
        created_at: "2026-04-21T12:00:00.000Z",
        recipient: {
          id: "recipient_2",
          email: "quiet@example.com",
          full_name: "Quiet Cook",
          notification_email_digest_enabled: false,
        },
        actor: {
          id: "actor_3",
          full_name: "Muted Chef",
          avatar_url: null,
          username: "muted",
        },
      },
    ]

    const notificationsChain = createNotificationsChain(notifications)
    const digestChain = createDigestTable(
      { data: null, error: null },
      { data: { id: "digest_1" }, error: null },
      { data: null, error: null }
    )

    const db = {
      from: vi.fn((table: string) => {
        if (table === "notifications") return notificationsChain
        if (table === "notification_email_digests") return digestChain
        throw new Error(`Unexpected table ${table}`)
      }),
    } as any

    const summary = await sendWeeklyNotificationDigests(db, { now, windowDays: 7 })

    expect(summary).toEqual({ recipientsProcessed: 1, digestsSent: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, requestInit] = fetchMock.mock.calls[0]
    expect(String(requestInit.body)).toContain("Weekly notifications")
    expect(String(requestInit.body)).toContain("chef@example.com")
    expect(notificationsChain.gte).toHaveBeenCalledWith("created_at", "2026-04-15T15:00:00.000Z")
    expect(notificationsChain.lt).toHaveBeenCalledWith("created_at", "2026-04-22T15:00:00.000Z")
  })

  it("skips a digest that already has a send log", async () => {
    const now = new Date("2026-04-22T15:00:00.000Z")
    const notifications = [
      {
        id: "n_1",
        recipient_id: "recipient_1",
        actor_id: "actor_1",
        type: "new_follower",
        entity_type: "follow_request",
        entity_id: "req_1",
        title: "Follow accepted",
        body: null,
        payload: {},
        read_at: null,
        created_at: "2026-04-20T12:00:00.000Z",
        recipient: {
          id: "recipient_1",
          email: "chef@example.com",
          full_name: "Chef One",
          notification_email_digest_enabled: true,
        },
        actor: {
          id: "actor_1",
          full_name: "Taylor Taste",
          avatar_url: null,
          username: "taylor",
        },
      },
    ]

    const notificationsChain = createNotificationsChain(notifications)
    const digestChain = createDigestTable(
      { data: { id: "digest_1", sent_at: "2026-04-21T00:00:00.000Z" }, error: null },
      { data: null, error: null },
      { data: null, error: null }
    )
    const db = {
      from: vi.fn((table: string) => {
        if (table === "notifications") return notificationsChain
        if (table === "notification_email_digests") return digestChain
        throw new Error(`Unexpected table ${table}`)
      }),
    } as any

    const summary = await sendWeeklyNotificationDigests(db, { now, windowDays: 7 })

    expect(summary).toEqual({ recipientsProcessed: 1, digestsSent: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
