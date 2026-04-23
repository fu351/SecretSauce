import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockResolveProfileAccess, mockCreateServiceSupabaseClient, mockWithServiceClient, mockGetPostsByAuthor } =
  vi.hoisted(() => ({
    mockResolveProfileAccess: vi.fn(),
    mockCreateServiceSupabaseClient: vi.fn(),
    mockWithServiceClient: vi.fn(),
    mockGetPostsByAuthor: vi.fn(),
  }))

vi.mock("@/lib/social/profile-access", () => ({
  resolveProfileAccess: mockResolveProfileAccess,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: mockCreateServiceSupabaseClient,
}))

vi.mock("@/lib/database/post-db", () => ({
  postDB: {
    withServiceClient: mockWithServiceClient,
  },
}))

describe("GET /api/users/[username]/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateServiceSupabaseClient.mockReturnValue({ from: vi.fn() })
    mockWithServiceClient.mockReturnValue({ getPostsByAuthor: mockGetPostsByAuthor })
  })

  it("returns 403 for unauthorized viewers of private profiles", async () => {
    mockResolveProfileAccess.mockResolvedValue({
      canViewContent: false,
    })

    const res = await GET(new Request("http://localhost/api/users/avery/posts"), {
      params: Promise.resolve({ username: "avery" }),
    })

    expect(res.status).toBe(403)
  })

  it("returns only the selected author's posts", async () => {
    const posts = [{ id: "post_1" }]
    mockResolveProfileAccess.mockResolvedValue({
      profile: { id: "profile_1" },
      viewerProfileId: "viewer_1",
      canViewContent: true,
    })
    mockGetPostsByAuthor.mockResolvedValue(posts)

    const res = await GET(new Request("http://localhost/api/users/avery/posts?limit=10&offset=3"), {
      params: Promise.resolve({ username: "avery" }),
    })

    expect(mockGetPostsByAuthor).toHaveBeenCalledWith("profile_1", "viewer_1", 10, 3)
    expect(await res.json()).toEqual({
      items: posts,
      posts,
      hasMore: false,
    })
  })
})
