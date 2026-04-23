import { beforeEach, describe, expect, it, vi } from "vitest"
import { DELETE, POST } from "../route"

const {
  mockAuth,
  mockFrom,
  mockWithServiceClient,
  mockSendFollowRequest,
  mockCancelFollow,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockSendFollowRequest: vi.fn(),
  mockCancelFollow: vi.fn(),
  mockCreateNotification: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock("@/lib/database/follow-db", () => ({
  followDB: {
    withServiceClient: mockWithServiceClient,
  },
}))

vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: mockCreateNotification,
}))

function createProfileLookup(result: any) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe("social follow routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithServiceClient.mockReturnValue({
      sendFollowRequest: mockSendFollowRequest,
      cancelFollow: mockCancelFollow,
    })
  })

  it("returns 401 for unauthenticated follow requests", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await POST(
      new Request("http://localhost/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: "profile_2" }),
      })
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: "Unauthorized" })
  })

  it("validates the follow target and blocks self-following", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))

    const res = await POST(
      new Request("http://localhost/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: "profile_1" }),
      })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: "Cannot follow yourself" })
    expect(mockSendFollowRequest).not.toHaveBeenCalled()
  })

  it("sends a follow request for the resolved viewer profile", async () => {
    const request = { id: "req_1", status: "pending" }

    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockSendFollowRequest.mockResolvedValue(request)
    mockCreateNotification.mockResolvedValue({ id: "n_1" })

    const res = await POST(
      new Request("http://localhost/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: "profile_2" }),
      })
    )

    expect(mockWithServiceClient).toHaveBeenCalled()
    expect(mockSendFollowRequest).toHaveBeenCalledWith("profile_1", "profile_2")
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recipientId: "profile_2",
      actorId: "profile_1",
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ request })
  })

  it("returns 404 when the authenticated user has no profile", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: null }))

    const res = await DELETE(
      new Request("http://localhost/api/social/follow", {
        method: "DELETE",
        body: JSON.stringify({ followingId: "profile_2" }),
      })
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: "Profile not found" })
  })

  it("unfollows successfully when the relationship exists", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockCancelFollow.mockResolvedValue(true)

    const res = await DELETE(
      new Request("http://localhost/api/social/follow", {
        method: "DELETE",
        body: JSON.stringify({ followingId: "profile_2" }),
      })
    )

    expect(mockCancelFollow).toHaveBeenCalledWith("profile_1", "profile_2")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
