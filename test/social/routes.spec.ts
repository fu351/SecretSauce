import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthenticatedProfile: vi.fn(),
  assertSocialEnabled: vi.fn(),
  getSocialPreferencesForProfile: vi.fn(),
  updateSocialPreferencesForProfile: vi.fn(),
  listOwnCookCheckDrafts: vi.fn(),
  createCookCheckDraftFromSource: vi.fn(),
  publishCookCheckDraft: vi.fn(),
  editCookCheckDraft: vi.fn(),
  skipCookCheckDraft: vi.fn(),
  getKitchenSyncFeed: vi.fn(),
  getProfileKitchenActivity: vi.fn(),
  addCookCheckReaction: vi.fn(),
  shareMealPlanWeek: vi.fn(),
  remixMealPlanShare: vi.fn(),
  createCookingJourneyForProfile: vi.fn(),
  recordJourneyProgressEvent: vi.fn(),
  completeCookingJourney: vi.fn(),
  resolveProfileAccess: vi.fn(),
  createServiceSupabaseClient: vi.fn(() => ({})),
}))

vi.mock("@/lib/foundation/server", () => ({
  getAuthenticatedProfile: mocks.getAuthenticatedProfile,
}))

vi.mock("@/lib/social/service", () => ({
  assertSocialEnabled: mocks.assertSocialEnabled,
  getSocialPreferencesForProfile: mocks.getSocialPreferencesForProfile,
  updateSocialPreferencesForProfile: mocks.updateSocialPreferencesForProfile,
  listOwnCookCheckDrafts: mocks.listOwnCookCheckDrafts,
  createCookCheckDraftFromSource: mocks.createCookCheckDraftFromSource,
  publishCookCheckDraft: mocks.publishCookCheckDraft,
  editCookCheckDraft: mocks.editCookCheckDraft,
  skipCookCheckDraft: mocks.skipCookCheckDraft,
  getKitchenSyncFeed: mocks.getKitchenSyncFeed,
  getProfileKitchenActivity: mocks.getProfileKitchenActivity,
  addCookCheckReaction: mocks.addCookCheckReaction,
  shareMealPlanWeek: mocks.shareMealPlanWeek,
  remixMealPlanShare: mocks.remixMealPlanShare,
  createCookingJourneyForProfile: mocks.createCookingJourneyForProfile,
  recordJourneyProgressEvent: mocks.recordJourneyProgressEvent,
  completeCookingJourney: mocks.completeCookingJourney,
  listVisibleMealPlanShares: vi.fn(),
  listOwnCookingJourneys: vi.fn(),
  removeCookCheckReaction: vi.fn(),
}))

vi.mock("@/lib/social/profile-access", () => ({
  resolveProfileAccess: mocks.resolveProfileAccess,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}))

import { PATCH as patchPrefs } from "@/app/api/social/preferences/route"
import { POST as createDraft } from "@/app/api/social/cook-checks/drafts/route"
import { POST as publishDraft } from "@/app/api/social/cook-checks/[id]/publish/route"
import { POST as shareWeek } from "@/app/api/social/meal-plans/[id]/share/route"
import { POST as remixShare } from "@/app/api/social/meal-plans/shares/[id]/remix/route"
import { POST as createJourney } from "@/app/api/social/journeys/route"
import { PATCH as updateJourney } from "@/app/api/social/journeys/[id]/route"
import { POST as completeJourney } from "@/app/api/social/journeys/[id]/complete/route"
import { GET as getProfileKitchenActivityRoute } from "@/app/api/users/[username]/kitchen-activity/route"

describe("social routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects unauthenticated writes", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" })
    const response = await patchPrefs(new Request("http://localhost/api/social/preferences", { method: "PATCH", body: "{}" }))
    expect(response.status).toBe(401)
  })

  it("blocks writes when social disabled", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_1", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(false)
    const response = await createDraft(new Request("http://localhost/api/social/cook-checks/drafts", { method: "POST", body: "{}" }))
    expect(response.status).toBe(403)
  })

  it("ignores client profile id for draft create", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.createCookCheckDraftFromSource.mockResolvedValue({ cookCheck: { id: "cook_1" }, duplicate: false })
    const response = await createDraft(
      new Request("http://localhost/api/social/cook-checks/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "profile_client", sourceType: "manual_meal" }),
      }),
    )
    expect(response.status).toBe(200)
    expect(mocks.createCookCheckDraftFromSource).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server" }),
    )
  })

  it("owner-only publish maps validation to 409", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.publishCookCheckDraft.mockResolvedValue({ validationError: "Only owner can publish this draft." })
    const response = await publishDraft(
      new Request("http://localhost/api/social/cook-checks/cook_1/publish", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ id: "cook_1" }) } as any,
    )
    expect(response.status).toBe(409)
  })

  it("shares a week using the authenticated profile, not client profile id", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.shareMealPlanWeek.mockResolvedValue({ share: { id: "share_1" }, duplicate: false })

    const response = await shareWeek(
      new Request("http://localhost/api/social/meal-plans/202619/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "profile_client", title: "Finals Week", visibility: "followers" }),
      }),
      { params: Promise.resolve({ id: "202619" }) } as any,
    )

    expect(response.status).toBe(200)
    expect(mocks.shareMealPlanWeek).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server", weekIndex: 202619 }),
    )
  })

  it("maps private share remix rejection to conflict", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.remixMealPlanShare.mockResolvedValue({ validationError: "Cannot remix this meal plan." })

    const response = await remixShare(
      new Request("http://localhost/api/social/meal-plans/shares/share_1/remix", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ id: "share_1" }) } as any,
    )

    expect(response.status).toBe(409)
  })

  it("creates journeys with server profile ownership", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.createCookingJourneyForProfile.mockResolvedValue({ journey: { id: "journey_1" } })

    const response = await createJourney(
      new Request("http://localhost/api/social/journeys", {
        method: "POST",
        body: JSON.stringify({ profileId: "profile_client", title: "21-Day Cooking Rhythm", journeyType: "cooking_rhythm", targetCount: 21 }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.createCookingJourneyForProfile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server", targetCount: 21 }),
    )
  })

  it("updates journey progress idempotently through the service", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.recordJourneyProgressEvent.mockResolvedValue({ journey: { id: "journey_1", current_progress: 2 } })

    const response = await updateJourney(
      new Request("http://localhost/api/social/journeys/journey_1", {
        method: "PATCH",
        body: JSON.stringify({ profileId: "profile_client", progressDelta: 1, idempotencyKey: "event-1" }),
      }),
      { params: Promise.resolve({ id: "journey_1" }) } as any,
    )

    expect(response.status).toBe(200)
    expect(mocks.recordJourneyProgressEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server", journeyId: "journey_1", idempotencyKey: "event-1" }),
    )
  })

  it("completes journeys through a safe projection service call", async () => {
    mocks.getAuthenticatedProfile.mockResolvedValue({ ok: true, profileId: "profile_server", supabase: {} })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.completeCookingJourney.mockResolvedValue({ journey: { id: "journey_1", status: "completed" } })

    const response = await completeJourney(
      new Request("http://localhost/api/social/journeys/journey_1/complete", {
        method: "POST",
        body: JSON.stringify({ visibility: "followers" }),
      }),
      { params: Promise.resolve({ id: "journey_1" }) } as any,
    )

    expect(response.status).toBe(200)
    expect(mocks.completeCookingJourney).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ profileId: "profile_server", journeyId: "journey_1", visibility: "followers" }),
    )
  })

  it("returns profile kitchen activity from the target profile, not a client profile", async () => {
    mocks.resolveProfileAccess.mockResolvedValue({
      profile: { id: "owner_1", username: "cook" },
      viewerProfileId: "viewer_1",
      canViewContent: true,
    })
    mocks.assertSocialEnabled.mockResolvedValue(true)
    mocks.getProfileKitchenActivity.mockResolvedValue({
      items: [{ id: "proj_1", title: "Finals Week", activityType: "meal_plan_share" }],
      hasMore: false,
    })

    const response = await getProfileKitchenActivityRoute(
      new Request("http://localhost/api/users/cook/kitchen-activity?limit=3"),
      { params: Promise.resolve({ username: "cook" }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.getProfileKitchenActivity).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ ownerProfileId: "owner_1", viewerProfileId: "viewer_1", limit: 3 }),
    )
    await expect(response.json()).resolves.toMatchObject({ items: [{ id: "proj_1" }] })
  })

  it("rejects profile kitchen activity for private profiles the viewer cannot access", async () => {
    mocks.resolveProfileAccess.mockResolvedValue({
      profile: { id: "owner_private", username: "cook" },
      viewerProfileId: "viewer_1",
      canViewContent: false,
    })

    const response = await getProfileKitchenActivityRoute(
      new Request("http://localhost/api/users/cook/kitchen-activity"),
      { params: Promise.resolve({ username: "cook" }) },
    )

    expect(response.status).toBe(403)
    expect(mocks.getProfileKitchenActivity).not.toHaveBeenCalled()
  })

  it("hides profile kitchen activity when social is disabled", async () => {
    mocks.resolveProfileAccess.mockResolvedValue({
      profile: { id: "owner_1", username: "cook" },
      viewerProfileId: "owner_1",
      canViewContent: true,
    })
    mocks.assertSocialEnabled.mockResolvedValue(false)

    const response = await getProfileKitchenActivityRoute(
      new Request("http://localhost/api/users/cook/kitchen-activity"),
      { params: Promise.resolve({ username: "cook" }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ items: [], hidden: true })
    expect(mocks.getProfileKitchenActivity).not.toHaveBeenCalled()
  })
})
