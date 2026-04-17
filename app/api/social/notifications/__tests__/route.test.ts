import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const { mockAuth, mockFrom } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

function createQueryChain(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }

  return chain
}

describe("GET /api/social/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: "Unauthorized" })
  })

  it("returns 404 when the viewer profile is missing", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createQueryChain({ data: null }))

    const res = await GET()

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: "Profile not found" })
  })

  it("merges notifications with follow requests pinned above recency-sorted activity", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })

    mockFrom
      .mockReturnValueOnce(createQueryChain({ data: { id: "viewer_1" } }))
      .mockReturnValueOnce(createQueryChain({
        data: [
          {
            id: "req_1",
            created_at: "2026-04-10T10:00:00.000Z",
            profiles: { id: "p1", full_name: "Pat Pending", avatar_url: null, username: "pat" },
          },
        ],
      }))
      .mockReturnValueOnce(createQueryChain({
        data: [
          {
            updated_at: "2026-04-12T12:00:00.000Z",
            profiles: { id: "p2", full_name: "Nora New", avatar_url: null, username: "nora" },
          },
        ],
      }))
      .mockReturnValueOnce(createQueryChain({
        data: [
          {
            created_at: "2026-04-11T08:00:00.000Z",
            profiles: { id: "p3", full_name: "Lina Like", avatar_url: null, username: "lina" },
            posts: { id: "post_1", title: "Crispy Tofu" },
          },
        ],
      }))
      .mockReturnValueOnce(createQueryChain({
        data: [
          {
            created_at: "2026-04-13T09:00:00.000Z",
            profiles: { id: "p4", full_name: "Rex Repost", avatar_url: null, username: "rex" },
            posts: { id: "post_2", title: "Sesame Noodles" },
          },
        ],
      }))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.notifications.map((n: any) => n.type)).toEqual([
      "follow_request",
      "post_repost",
      "new_follower",
      "post_like",
    ])
    expect(body.notifications[0]).toMatchObject({
      requestId: "req_1",
      from: { username: "pat" },
    })
    expect(body.notifications[1]).toMatchObject({
      post: { title: "Sesame Noodles" },
    })
  })
})
