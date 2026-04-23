import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../route"

const {
  mockAuth,
  mockFrom,
  mockWithServiceClient,
  mockToggleRepost,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockToggleRepost: vi.fn(),
  mockCreateNotification: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock("@/lib/database/post-db", () => ({
  postDB: {
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

function createPostLookup(result: any) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe("POST /api/posts/[postId]/repost", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithServiceClient.mockReturnValue({
      toggleRepost: mockToggleRepost,
    })
  })

  it("creates a notification when a post is reposted", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom
      .mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
      .mockReturnValueOnce(createPostLookup({ data: { id: "post_1", author_id: "author_1", title: "Dinner" } }))
    mockToggleRepost.mockResolvedValue(true)
    mockCreateNotification.mockResolvedValue({ id: "n_1" })

    const res = await POST(
      new Request("http://localhost/api/posts/post_1/repost", { method: "POST" }),
      { params: Promise.resolve({ postId: "post_1" }) }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reposted: true })
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recipientId: "author_1",
      actorId: "profile_1",
      type: "post_repost",
    }))
  })
})
