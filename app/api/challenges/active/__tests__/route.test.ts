import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "../route"

const {
  mockAuth,
  mockFrom,
  mockWithServiceClient,
  mockGetActiveChallenges,
  mockGetEntry,
  mockGetViewerRank,
  mockGetViewerVote,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockWithServiceClient: vi.fn(),
  mockGetActiveChallenges: vi.fn(),
  mockGetEntry: vi.fn(),
  mockGetViewerRank: vi.fn(),
  mockGetViewerVote: vi.fn(),
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
      getActiveChallenges: mockGetActiveChallenges,
      getEntry: mockGetEntry,
      getViewerRank: mockGetViewerRank,
      getViewerVote: mockGetViewerVote,
    })
  })

  it("returns nulls when there are no active challenges", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    mockGetActiveChallenges.mockResolvedValue({ star: null, community: [] })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.starChallenge).toBeNull()
    expect(body.communityChallenges).toEqual([])
    expect(body.challenge).toBeNull()
  })

  it("returns the star challenge with viewer entry and rank", async () => {
    const starChallenge = {
      id: "challenge_1",
      title: "Iron Chef Showdown",
      challenge_type: "star",
      starts_at: "2026-04-07T00:00:00.000Z",
      ends_at: "2026-04-13T23:59:59.000Z",
      points: 200,
      participant_count: 15,
    }
    const entry = { id: "entry_1", challenge_id: "challenge_1", profile_id: "profile_1", post_id: "post_1" }

    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockGetActiveChallenges.mockResolvedValue({ star: starChallenge, community: [] })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockGetEntry.mockResolvedValue(entry)
    mockGetViewerRank.mockResolvedValue(2)

    const res = await GET()
    const body = await res.json()

    expect(body.starChallenge).toEqual(starChallenge)
    expect(body.starEntry).toEqual(entry)
    expect(body.starRank).toBe(2)
    expect(body.communityChallenges).toEqual([])
    expect(body.viewerProfileId).toBe("profile_1")
  })

  it("returns community challenges with viewer entries and votes", async () => {
    const communityChallenge = {
      id: "challenge_2",
      title: "Pantry Rescue",
      challenge_type: "community",
      starts_at: "2026-04-07T00:00:00.000Z",
      ends_at: "2026-04-13T23:59:59.000Z",
      points: 100,
      participant_count: 42,
    }
    const communityEntry = { id: "entry_2", challenge_id: "challenge_2", profile_id: "profile_1", post_id: null }
    const communityVote  = { id: "vote_1", challenge_id: "challenge_2", voter_profile_id: "profile_1", entry_profile_id: "profile_2" }

    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockGetActiveChallenges.mockResolvedValue({ star: null, community: [communityChallenge] })
    mockFrom.mockReturnValueOnce(createProfileLookup({ data: { id: "profile_1" } }))
    mockGetEntry.mockResolvedValue(communityEntry)
    mockGetViewerVote.mockResolvedValue(communityVote)

    const res = await GET()
    const body = await res.json()

    expect(body.starChallenge).toBeNull()
    expect(body.communityChallenges).toEqual([communityChallenge])
    expect(body.communityEntries["challenge_2"]).toEqual({ entry: communityEntry, vote: communityVote })
  })
})
