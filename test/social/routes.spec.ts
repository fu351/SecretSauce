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
  addCookCheckReaction: vi.fn(),
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
  addCookCheckReaction: mocks.addCookCheckReaction,
  removeCookCheckReaction: vi.fn(),
}))

import { PATCH as patchPrefs } from "@/app/api/social/preferences/route"
import { POST as createDraft } from "@/app/api/social/cook-checks/drafts/route"
import { POST as publishDraft } from "@/app/api/social/cook-checks/[id]/publish/route"

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
})
