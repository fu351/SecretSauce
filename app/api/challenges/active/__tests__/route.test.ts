import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const {
  mockAuth,
  mockFrom,
  mockWithServiceClient,
  mockGetActiveChallenge,
  mockGetParticipantCount,
  mockGetEntry,
  mockGetViewerRank,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockGetActiveChallenge: vi.fn(),
  mockGetParticipantCount: vi.fn(),
  mockGetEntry: vi.fn(),
  mockGetViewerRank: vi.fn(),
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

describe("GET /api/challenges/active", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithServiceClient.mockReturnValue({
      getActiveChallenge: mockGetActiveChallenge,
      getParticipantCount: mockGetParticipantCount,
      getEntry: mockGetEntry,
      getViewerRank: mockGetViewerRank,
    })
  })

  it("returns null when there is no active challenge", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    mockGetActiveChallenge.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ challenge: null })
  })

  it("returns the active challenge with participant count and viewer data", async () => {
    const challenge = {
      id: "challenge_1",
      title: "Pantry Rescue",
      starts_at: "2026-04-07T00:00:00.000Z",
      ends_at: "2026-04-13T23:59:59.000Z",
      points: 100,
    }
    const entry = { id: "entry_1", challenge_id: "challenge_1", profile_id: "profile_1", post_id: "post_1" }

    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockGetActiveChallenge.mockResolvedValue(challenge)
    mockGetParticipantCount.mockResolvedValue(42)
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockGetEntry.mockResolvedValue(entry)
    mockGetViewerRank.mockResolvedValue(3)

    const res = await GET()
    const body = await res.json()

    expect(mockGetEntry).toHaveBeenCalledWith("challenge_1", "profile_1")
    expect(mockGetViewerRank).toHaveBeenCalledWith("challenge_1", "profile_1", "friends")
    expect(body).toEqual({
      challenge: { ...challenge, participant_count: 42 },
      entry,
      rank: 3,
      viewerProfileId: "profile_1",
    })
  })
})
