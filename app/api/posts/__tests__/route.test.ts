import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../route"

const { mockAuth, mockFrom, mockWithServiceClient, mockCreatePost } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockCreatePost: vi.fn(),
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

describe("POST /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithServiceClient.mockReturnValue({
      createPost: mockCreatePost,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "https://example.com/dish.jpg", title: "Dinner" }),
      })
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: "Unauthorized" })
  })

  it("validates required post fields", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })

    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
      })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: "imageUrl and title are required" })
  })

  it("creates a post for the resolved viewer profile", async () => {
    const post = {
      id: "post_1",
      author_id: "profile_1",
      image_url: "https://example.com/dish.jpg",
      title: "Dinner",
      caption: "Big success",
    }

    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockCreatePost.mockResolvedValue(post)

    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({
          imageUrl: "https://example.com/dish.jpg",
          title: "Dinner",
          caption: "Big success",
        }),
      })
    )

    expect(mockCreatePost).toHaveBeenCalledWith({
      authorId: "profile_1",
      imageUrl: "https://example.com/dish.jpg",
      title: "Dinner",
      caption: "Big success",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ post })
  })
})
