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
  listMealScheduleForWeek: vi.fn(),
  listRecipesByIds: vi.fn(),
  findMealPlanShareByIdempotency: vi.fn(),
  createMealPlanShare: vi.fn(),
  updateMealPlanShare: vi.fn(),
  getMealPlanShareById: vi.fn(),
  listExistingMealSlots: vi.fn(),
  insertMealScheduleRows: vi.fn(),
  createMealPlanRemix: vi.fn(),
  getCookingJourneyById: vi.fn(),
  findJourneyEventByIdempotency: vi.fn(),
  createJourneyEvent: vi.fn(),
  updateCookingJourney: vi.fn(),
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
  listMealScheduleForWeek: mocks.listMealScheduleForWeek,
  listRecipesByIds: mocks.listRecipesByIds,
  findMealPlanShareByIdempotency: mocks.findMealPlanShareByIdempotency,
  createMealPlanShare: mocks.createMealPlanShare,
  updateMealPlanShare: mocks.updateMealPlanShare,
  getMealPlanShareById: mocks.getMealPlanShareById,
  listPublishedMealPlanShares: vi.fn(),
  listExistingMealSlots: mocks.listExistingMealSlots,
  insertMealScheduleRows: mocks.insertMealScheduleRows,
  createMealPlanRemix: mocks.createMealPlanRemix,
  archiveProjection: vi.fn(),
  listCookingJourneys: vi.fn(),
  createCookingJourney: vi.fn(),
  getCookingJourneyById: mocks.getCookingJourneyById,
  findJourneyEventByIdempotency: mocks.findJourneyEventByIdempotency,
  createJourneyEvent: mocks.createJourneyEvent,
  updateCookingJourney: mocks.updateCookingJourney,
  upsertCookCheckReaction: vi.fn(),
  deleteCookCheckReaction: vi.fn(),
}))

const productEvents = vi.hoisted(() => ({
  appendProductEvent: vi.fn(),
}))

vi.mock("@/lib/foundation/product-events-service", () => ({
  appendProductEvent: productEvents.appendProductEvent,
}))

const projections = vi.hoisted(() => ({
  createSocialActivityProjection: vi.fn(),
}))

vi.mock("@/lib/foundation/social-projections", () => ({
  createSocialActivityProjection: projections.createSocialActivityProjection,
}))

import { recordJourneyProgressEvent, remixMealPlanShare, shareMealPlanWeek, createCookCheckDraftFromSource, getKitchenSyncFeed } from "@/lib/social/service"

describe("social service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productEvents.appendProductEvent.mockResolvedValue({ event: { id: "event_1" } })
    projections.createSocialActivityProjection.mockResolvedValue({ projection: { id: "projection_1" } })
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

  it("publishes sanitized meal plan share projections", async () => {
    mocks.findMealPlanShareByIdempotency.mockResolvedValue({ data: null })
    mocks.listMealScheduleForWeek.mockResolvedValue({
      data: [
        { id: "meal_1", user_id: "profile_1", recipe_id: "recipe_1", date: "2026-05-04", meal_type: "dinner", week_index: 202619 },
      ],
      error: null,
    })
    mocks.listRecipesByIds.mockResolvedValue({
      data: [{ id: "recipe_1", title: "Chicken Bowl", tags: ["high-protein"], protein: "chicken" }],
      error: null,
    })
    mocks.createMealPlanShare.mockResolvedValue({
      data: { id: "share_1", sanitized_summary: {}, owner_profile_id: "profile_1" },
      error: null,
    })
    mocks.updateMealPlanShare.mockResolvedValue({
      data: { id: "share_1", projection_id: "projection_1" },
      error: null,
    })

    const result = await shareMealPlanWeek({} as any, {
      profileId: "profile_1",
      weekIndex: 202619,
      title: "Finals Week Meal Plan",
      visibility: "followers",
    })

    expect((result as any).share.id).toBe("share_1")
    expect(projections.createSocialActivityProjection).toHaveBeenCalledWith(
      {},
      "profile_1",
      expect.objectContaining({
        eventType: "meal_plan_share.published",
        visibility: "followers",
        payload: expect.not.objectContaining({ pantryInventory: expect.anything() }),
      }),
    )
  })

  it("remixes visible shared plans into user-owned meal slots", async () => {
    mocks.getMealPlanShareById.mockResolvedValue({
      data: {
        id: "share_1",
        owner_profile_id: "owner_1",
        visibility: "followers",
        status: "published",
        sanitized_summary: {
          title: "Finals Week",
          slots: [{ dayOffset: 0, mealType: "dinner", recipeId: "recipe_1", recipeTitle: "Chicken Bowl" }],
        },
      },
      error: null,
    })
    mocks.getAcceptedFollowMapForViewer.mockResolvedValue({ data: new Set(["owner_1"]) })
    mocks.listExistingMealSlots.mockResolvedValue({ data: [], error: null })
    mocks.insertMealScheduleRows.mockResolvedValue({ data: [{ id: "meal_new" }], error: null })
    mocks.createMealPlanRemix.mockResolvedValue({ data: { id: "remix_1" }, error: null })

    const result = await remixMealPlanShare({} as any, {
      profileId: "profile_1",
      shareId: "share_1",
      targetWeekIndex: 202620,
    })

    expect((result as any).createdMeals).toHaveLength(1)
    expect(mocks.insertMealScheduleRows).toHaveBeenCalledWith(
      {},
      [expect.objectContaining({ user_id: "profile_1", recipe_id: "recipe_1", week_index: 202620 })],
    )
  })

  it("does not double-count idempotent journey progress events", async () => {
    mocks.getCookingJourneyById.mockResolvedValue({
      data: { id: "journey_1", profile_id: "profile_1", status: "active", current_progress: 2, target_count: 4 },
      error: null,
    })
    mocks.findJourneyEventByIdempotency.mockResolvedValue({ data: { id: "event_existing" } })

    const result = await recordJourneyProgressEvent({} as any, {
      profileId: "profile_1",
      journeyId: "journey_1",
      idempotencyKey: "same-event",
    })

    expect((result as any).duplicate).toBe(true)
    expect(mocks.createJourneyEvent).not.toHaveBeenCalled()
    expect(mocks.updateCookingJourney).not.toHaveBeenCalled()
  })
})
