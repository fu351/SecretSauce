import { beforeEach, describe, expect, it, vi } from "vitest"
import { DELETE, POST } from "../route"

const {
  mockAuth,
  mockFrom,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

function createProfileLookup(result: any) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue(result),
      })),
    })),
  }
}

describe("POST /api/push-subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("upserts a push subscription for the current profile", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })

    const res = await POST(
      new Request("http://localhost/api/push-subscriptions", {
        method: "POST",
        headers: { "user-agent": "test-agent" },
        body: JSON.stringify({
          subscription: {
            endpoint: "https://push.test/endpoint",
            keys: { auth: "auth", p256dh: "p256dh" },
          },
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})

describe("DELETE /api/push-subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deletes the current profile's endpoint subscription", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    const deleteChain = {
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }
    mockFrom.mockReturnValueOnce(deleteChain)

    const res = await DELETE(
      new Request("http://localhost/api/push-subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: "https://push.test/endpoint" }),
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
