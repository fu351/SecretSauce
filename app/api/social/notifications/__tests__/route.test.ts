import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PATCH } from "../route"

const {
  mockAuth,
  mockFrom,
  mockFetchNotifications,
  mockFetchUnreadNotificationCount,
  mockMarkAllNotificationsRead,
  mockMarkNotificationRead,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockFetchNotifications: vi.fn(),
  mockFetchUnreadNotificationCount: vi.fn(),
  mockMarkAllNotificationsRead: vi.fn(),
  mockMarkNotificationRead: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock("@/lib/notifications/notification-service", () => ({
  fetchNotifications: mockFetchNotifications,
  fetchUnreadNotificationCount: mockFetchUnreadNotificationCount,
  markAllNotificationsRead: mockMarkAllNotificationsRead,
  markNotificationRead: mockMarkNotificationRead,
}))

function createProfileLookup(result: any) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe("GET /api/social/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await GET(new Request("http://localhost/api/social/notifications"))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: "Unauthorized" })
  })

  it("returns unreadCount when countOnly=true", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "viewer_1" } }))
    mockFetchUnreadNotificationCount.mockResolvedValue(3)

    const res = await GET(new Request("http://localhost/api/social/notifications?countOnly=true"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ unreadCount: 3 })
    expect(mockFetchUnreadNotificationCount).toHaveBeenCalledWith(expect.anything(), "viewer_1")
  })

  it("returns notifications and unread count for the viewer", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "viewer_1" } }))
    mockFetchNotifications.mockResolvedValue([
      {
        id: "n_1",
        type: "follow_request",
        requestId: "req_1",
        from: { id: "p1", full_name: "Pat Pending", avatar_url: null, username: "pat" },
        created_at: "2026-04-13T09:00:00.000Z",
        read_at: null,
      },
    ])
    mockFetchUnreadNotificationCount.mockResolvedValue(1)

    const res = await GET(new Request("http://localhost/api/social/notifications"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.notifications).toHaveLength(1)
    expect(body.unreadCount).toBe(1)
    expect(mockFetchNotifications).toHaveBeenCalledWith(expect.anything(), "viewer_1", { limit: 20, unreadOnly: false })
  })
})

describe("PATCH /api/social/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("marks all notifications read by default", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "viewer_1" } }))
    mockMarkAllNotificationsRead.mockResolvedValue(true)

    const res = await PATCH(new Request("http://localhost/api/social/notifications", { method: "PATCH" }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockMarkAllNotificationsRead).toHaveBeenCalledWith(expect.anything(), "viewer_1")
  })

  it("marks a single notification read when requested", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "viewer_1" } }))
    mockMarkNotificationRead.mockResolvedValue(true)

    const res = await PATCH(
      new Request("http://localhost/api/social/notifications", {
        method: "PATCH",
        body: JSON.stringify({ action: "mark_read", notificationId: "n_1" }),
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockMarkNotificationRead).toHaveBeenCalledWith(expect.anything(), "viewer_1", "n_1")
  })
})
