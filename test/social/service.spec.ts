import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOwnedRecipeTry: vi.fn(),
  getOwnedVerificationTask: vi.fn(),
  getOwnedProductEvent: vi.fn(),
  findExistingDraftBySource: vi.fn(),
  createCookCheckDraft: vi.fn(),
  getSocialPreferences: vi.fn(),
  listKitchenSyncProjections: vi.fn(),
  getAcceptedFollowMapForViewer: vi.fn(),
  listReactionsForCookChecks: vi.fn(),
}))

vi.mock("@/lib/social/repository", () => ({
  getOwnedRecipeTry: mocks.getOwnedRecipeTry,
  getOwnedVerificationTask: mocks.getOwnedVerificationTask,
  getOwnedProductEvent: mocks.getOwnedProductEvent,
  findExistingDraftBySource: mocks.findExistingDraftBySource,
  createCookCheckDraft: mocks.createCookCheckDraft,
  getSocialPreferences: mocks.getSocialPreferences,
  listCookCheckDrafts: vi.fn(),
  getCookCheckById: vi.fn(),
  updateCookCheck: vi.fn(),
  updateSocialPreferences: vi.fn(),
  listKitchenSyncProjections: mocks.listKitchenSyncProjections,
  getAcceptedFollowMapForViewer: mocks.getAcceptedFollowMapForViewer,
  listReactionsForCookChecks: mocks.listReactionsForCookChecks,
  upsertCookCheckReaction: vi.fn(),
  deleteCookCheckReaction: vi.fn(),
}))

vi.mock("@/lib/foundation/product-events-service", () => ({
  appendProductEvent: vi.fn(),
}))

vi.mock("@/lib/foundation/social-projections", () => ({
  createSocialActivityProjection: vi.fn(),
}))

import { createCookCheckDraftFromSource, getKitchenSyncFeed } from "@/lib/social/service"

describe("social service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("prevents duplicate source draft", async () => {
    mocks.getOwnedRecipeTry.mockResolvedValue({ data: { id: "try_1" } })
    mocks.findExistingDraftBySource.mockResolvedValue({ data: { id: "cook_existing" } })
    const result = await createCookCheckDraftFromSource({} as any, {
      profileId: "profile_1",
      sourceType: "recipe_try",
      sourceRecipeTryId: "try_1",
    })
    expect((result as any).duplicate).toBe(true)
  })

  it("filters feed by visibility and expiration", async () => {
    mocks.listKitchenSyncProjections.mockResolvedValue({
      data: [
        {
          id: "proj_private",
          owner_profile_id: "other",
          visibility: "private",
          payload: { cookCheckId: "cook_1" },
          occurred_at: "2026-05-01T00:00:00.000Z",
          expires_at: null,
        },
        {
          id: "proj_public_expired",
          owner_profile_id: "other",
          visibility: "public",
          payload: { cookCheckId: "cook_2" },
          occurred_at: "2026-05-02T00:00:00.000Z",
          expires_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "proj_followers",
          owner_profile_id: "owner_a",
          visibility: "followers",
          payload: { cookCheckId: "cook_3" },
          occurred_at: "2026-05-03T00:00:00.000Z",
          expires_at: null,
        },
      ],
      error: null,
    })
    mocks.getAcceptedFollowMapForViewer.mockResolvedValue({ data: new Set(["owner_a"]) })
    mocks.listReactionsForCookChecks.mockResolvedValue({ data: [] })
    mocks.getSocialPreferences.mockResolvedValue({ data: { show_reaction_counts: true } })

    const result = await getKitchenSyncFeed({} as any, "viewer_1")
    expect(result.feed).toHaveLength(1)
    expect(result.feed[0].id).toBe("proj_followers")
  })
})
