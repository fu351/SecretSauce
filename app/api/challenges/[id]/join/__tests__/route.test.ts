import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../route"

const { mockAuth, mockFrom, mockWithServiceClient, mockJoinChallenge } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockJoinChallenge: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock("@/lib/database/challenge-db", () => ({
  challengeDB: {
    withServiceClient: mockWithServiceClient,
  },
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

function createChallengeLookup(result: any) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  }
}

describe("POST /api/challenges/[id]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithServiceClient.mockReturnValue({
      joinChallenge: mockJoinChallenge,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await POST(
      new Request("http://localhost/api/challenges/challenge_1/join", { method: "POST" }),
      { params: Promise.resolve({ id: "challenge_1" }) }
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: "Unauthorized" })
  })

  it("returns 404 when the challenge is not active", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom
      .mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
      .mockReturnValueOnce(createChallengeLookup({ data: null }))

    const res = await POST(
      new Request("http://localhost/api/challenges/challenge_1/join", { method: "POST" }),
      { params: Promise.resolve({ id: "challenge_1" }) }
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: "Challenge not found or not active" })
  })

  it("joins the active challenge and forwards an optional post id", async () => {
    const entry = { id: "entry_1", challenge_id: "challenge_1", profile_id: "profile_1", post_id: "post_9" }

    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom
      .mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
      .mockReturnValueOnce(createChallengeLookup({ data: { id: "challenge_1", ends_at: "2026-04-20T23:59:59.000Z" } }))
    mockJoinChallenge.mockResolvedValue(entry)

    const res = await POST(
      new Request("http://localhost/api/challenges/challenge_1/join", {
        method: "POST",
        body: JSON.stringify({ postId: "post_9" }),
      }),
      { params: Promise.resolve({ id: "challenge_1" }) }
    )

    expect(mockJoinChallenge).toHaveBeenCalledWith("challenge_1", "profile_1", "post_9")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entry })
  })
})
