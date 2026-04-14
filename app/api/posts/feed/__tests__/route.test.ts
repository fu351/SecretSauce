import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockAuth, mockFrom, mockWithServiceClient, mockGetFeedPosts } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockGetFeedPosts: vi.fn(),
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

function createProfileLookup(result: any) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe("GET /api/posts/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithServiceClient.mockReturnValue({
      getFeedPosts: mockGetFeedPosts,
    })
  })

  it("returns a public feed for anonymous viewers", async () => {
    const posts = [{ id: "post_1" }]
    mockAuth.mockResolvedValue({ userId: null })
    mockGetFeedPosts.mockResolvedValue(posts)

    const res = await GET(new Request("http://localhost/api/posts/feed?limit=200&offset=4"))

    expect(mockGetFeedPosts).toHaveBeenCalledWith(null, 50, 4)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ posts })
  })

  it("uses the resolved viewer profile for authenticated feeds", async () => {
    const posts = [{ id: "post_2" }]
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockGetFeedPosts.mockResolvedValue(posts)

    const res = await GET(new Request("http://localhost/api/posts/feed?limit=10&offset=3"))

    expect(mockGetFeedPosts).toHaveBeenCalledWith("profile_1", 10, 3)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ posts })
  })
})
