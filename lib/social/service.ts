import { normalizeUserFeaturePreferences } from "@/lib/foundation/preferences"
import { appendProductEvent } from "@/lib/foundation/product-events-service"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"
import { createSocialActivityProjection } from "@/lib/foundation/social-projections"
import { isSocialEnabledForProfile } from "@/lib/social/guards"
import {
  buildCookCheckProjectionPayload,
  canViewerSeeVisibility,
  isCookCheckExpired,
  isValidSocialVisibility,
  normalizeCaption,
  validateReactionKey,
} from "@/lib/social/helpers"
import {
  createCookCheckDraft,
  deleteCookCheckReaction,
  findExistingDraftBySource,
  getAcceptedFollowMapForViewer,
  getCookCheckById,
  getOwnedProductEvent,
  getOwnedRecipeTry,
  getOwnedVerificationTask,
  getSocialPreferences,
  listCookCheckDrafts,
  listKitchenSyncProjections,
  listReactionsForCookChecks,
  updateCookCheck,
  updateSocialPreferences,
  upsertCookCheckReaction,
} from "@/lib/social/repository"
import type { CookCheckSourceType, SocialVisibility } from "@/lib/social/types"

type SupabaseLike = { from: (table: string) => any }

export async function assertSocialEnabled(supabase: SupabaseLike, profileId: string) {
  return isSocialEnabledForProfile(supabase, profileId)
}

export async function getSocialPreferencesForProfile(supabase: SupabaseLike, profileId: string) {
  const { data, error } = await getSocialPreferences(supabase, profileId)
  if (error) return { error }
  return { preferences: normalizeUserFeaturePreferences(data) }
}

export async function updateSocialPreferencesForProfile(
  supabase: SupabaseLike,
  profileId: string,
  input: Record<string, unknown>,
) {
  const patch: Partial<{ social_enabled: boolean; social_visibility_default: SocialVisibility; show_reaction_counts: boolean }> = {}
  if (typeof input.socialEnabled === "boolean") patch.social_enabled = input.socialEnabled
  if (isValidSocialVisibility(input.socialVisibilityDefault)) patch.social_visibility_default = input.socialVisibilityDefault
  if (typeof input.showReactionCounts === "boolean") patch.show_reaction_counts = input.showReactionCounts
  if (Object.keys(patch).length === 0) return { validationError: "No valid social preference fields." }
  const { data, error } = await updateSocialPreferences(supabase, profileId, patch)
  if (error) return { error }
  await appendProductEvent(supabase, profileId, {
    eventType: "preferences.updated",
    idempotencyKey: buildIdempotencyKey(["social-preferences-updated", profileId, Date.now()]),
    metadata: { fields: Object.keys(patch) },
  })
  return { preferences: normalizeUserFeaturePreferences(data) }
}

export async function createCookCheckDraftFromSource(
  supabase: SupabaseLike,
  input: {
    profileId: string
    sourceType: CookCheckSourceType
    sourceRecipeTryId?: string | null
    sourceVerificationTaskId?: string | null
    sourceProductEventId?: string | null
    caption?: string | null
    visibility?: SocialVisibility
    idempotencyKey?: string | null
  },
) {
  if (!["recipe_try", "streak", "verification", "manual_meal"].includes(input.sourceType)) {
    return { validationError: "Unsupported source type." }
  }
  if (input.sourceRecipeTryId) {
    const { data } = await getOwnedRecipeTry(supabase, input.profileId, input.sourceRecipeTryId)
    if (!data) return { validationError: "recipeTry source is not owned by profile." }
  }
  if (input.sourceVerificationTaskId) {
    const { data } = await getOwnedVerificationTask(supabase, input.profileId, input.sourceVerificationTaskId)
    if (!data) return { validationError: "verificationTask source is not owned by profile." }
  }
  if (input.sourceProductEventId) {
    const { data } = await getOwnedProductEvent(supabase, input.profileId, input.sourceProductEventId)
    if (!data) return { validationError: "productEvent source is not owned by profile." }
  }

  const { data: existing } = await findExistingDraftBySource(supabase, input.profileId, {
    sourceRecipeTryId: input.sourceRecipeTryId,
    sourceVerificationTaskId: input.sourceVerificationTaskId,
    sourceProductEventId: input.sourceProductEventId,
  })
  if (existing) return { cookCheck: existing, duplicate: true as const }

  const prefs = await getSocialPreferencesForProfile(supabase, input.profileId)
  if ("error" in prefs && prefs.error) return { error: prefs.error }
  const visibility = isValidSocialVisibility(input.visibility)
    ? input.visibility
    : prefs.preferences.socialVisibilityDefault
  const caption = normalizeCaption(input.caption)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await createCookCheckDraft(supabase, {
    profileId: input.profileId,
    sourceType: input.sourceType,
    sourceRecipeTryId: input.sourceRecipeTryId ?? null,
    sourceVerificationTaskId: input.sourceVerificationTaskId ?? null,
    sourceProductEventId: input.sourceProductEventId ?? null,
    visibility,
    caption,
    idempotencyKey: input.idempotencyKey ?? null,
    expiresAt,
  })
  if (error) return { error }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["cook-check-draft-created", input.profileId, data.id]),
    metadata: { cookCheckId: data.id, status: "draft" },
  })
  return { cookCheck: data, duplicate: false as const }
}

export async function listOwnCookCheckDrafts(supabase: SupabaseLike, profileId: string) {
  const { data, error } = await listCookCheckDrafts(supabase, profileId)
  if (error) return { error }
  return { drafts: data ?? [] }
}

export async function publishCookCheckDraft(
  supabase: SupabaseLike,
  input: { profileId: string; cookCheckId: string; visibility?: SocialVisibility; caption?: string | null },
) {
  const { data: cookCheck, error: readError } = await getCookCheckById(supabase, input.cookCheckId)
  if (readError || !cookCheck) return { validationError: "Cook check draft not found." }
  if (cookCheck.profile_id !== input.profileId) return { validationError: "Only owner can publish this draft." }
  if (cookCheck.status !== "draft") return { validationError: "Only draft cook checks can be published." }

  const visibility = isValidSocialVisibility(input.visibility) ? input.visibility : cookCheck.visibility
  const caption = normalizeCaption(input.caption ?? cookCheck.caption)
  const payload = buildCookCheckProjectionPayload({
    cookCheckId: cookCheck.id,
    activityType: "cook_check",
    caption,
  })
  const projection = await createSocialActivityProjection(supabase, input.profileId, {
    eventType: "cook_check.approved",
    visibility,
    payload,
    occurredAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    expiresAt: cookCheck.expires_at ?? null,
  })
  if ("validationError" in projection) return projection
  if ("error" in projection && projection.error) return projection

  const { data: updated, error: updateError } = await updateCookCheck(supabase, input.cookCheckId, {
    status: "published",
    visibility,
    caption,
    projection_id: projection.projection.id,
    published_at: new Date().toISOString(),
  })
  if (updateError) return { error: updateError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["cook-check-published", input.profileId, input.cookCheckId]),
    metadata: { cookCheckId: input.cookCheckId, projectionId: projection.projection.id },
  })
  return { cookCheck: updated, projection: projection.projection }
}

export async function editCookCheckDraft(
  supabase: SupabaseLike,
  input: { profileId: string; cookCheckId: string; caption?: string | null; visibility?: SocialVisibility },
) {
  const { data: cookCheck } = await getCookCheckById(supabase, input.cookCheckId)
  if (!cookCheck) return { validationError: "Cook check not found." }
  if (cookCheck.profile_id !== input.profileId) return { validationError: "Only owner can edit cook checks." }
  if (cookCheck.status !== "draft") return { validationError: "Only draft cook checks can be edited." }
  const patch: Record<string, unknown> = {}
  if (input.caption !== undefined) patch.caption = normalizeCaption(input.caption)
  if (isValidSocialVisibility(input.visibility)) patch.visibility = input.visibility
  if (Object.keys(patch).length === 0) return { validationError: "No valid fields to update." }
  const { data, error } = await updateCookCheck(supabase, input.cookCheckId, patch as any)
  if (error) return { error }
  return { cookCheck: data }
}

export async function skipCookCheckDraft(supabase: SupabaseLike, input: { profileId: string; cookCheckId: string }) {
  const { data: cookCheck } = await getCookCheckById(supabase, input.cookCheckId)
  if (!cookCheck) return { validationError: "Cook check not found." }
  if (cookCheck.profile_id !== input.profileId) return { validationError: "Only owner can skip cook checks." }
  if (cookCheck.status !== "draft") return { validationError: "Only draft cook checks can be skipped." }
  const { data, error } = await updateCookCheck(supabase, input.cookCheckId, {
    status: "skipped",
    skipped_at: new Date().toISOString(),
  })
  if (error) return { error }
  return { cookCheck: data }
}

export async function getKitchenSyncFeed(supabase: SupabaseLike, viewerProfileId: string) {
  const [{ data: projections, error: projectionError }, { data: followSet }] = await Promise.all([
    listKitchenSyncProjections(supabase, 50),
    getAcceptedFollowMapForViewer(supabase, viewerProfileId),
  ])
  if (projectionError) return { error: projectionError }

  const visible = (projections ?? []).filter((projection: any) => {
    if (isCookCheckExpired(projection.expires_at)) return false
    return canViewerSeeVisibility({
      ownerProfileId: projection.owner_profile_id,
      viewerProfileId,
      visibility: projection.visibility,
      viewerFollowsOwner: followSet?.has(projection.owner_profile_id) ?? false,
    })
  })

  const cookCheckIds = visible
    .map((projection: any) => projection.payload?.cookCheckId)
    .filter((id: unknown): id is string => typeof id === "string")
  const { data: reactions } = await listReactionsForCookChecks(supabase, cookCheckIds)
  const { data: viewerPrefs } = await getSocialPreferences(supabase, viewerProfileId)
  const viewerShowCounts = normalizeUserFeaturePreferences(viewerPrefs).showReactionCounts

  const grouped = (reactions ?? []).reduce<Record<string, { total: number; byKey: Record<string, number>; mine: string[] }>>((acc, row: any) => {
    const key = row.cook_check_id as string
    if (!acc[key]) acc[key] = { total: 0, byKey: {}, mine: [] }
    acc[key].total += 1
    acc[key].byKey[row.reaction_key] = (acc[key].byKey[row.reaction_key] ?? 0) + 1
    if (row.reactor_profile_id === viewerProfileId) acc[key].mine.push(row.reaction_key)
    return acc
  }, {})

  const feed = visible.map((projection: any) => {
    const cookCheckId = projection.payload?.cookCheckId as string | undefined
    const reaction = cookCheckId ? grouped[cookCheckId] : undefined
    return {
      ...projection,
      reactions: {
        mine: reaction?.mine ?? [],
        counts: viewerShowCounts ? reaction?.byKey ?? {} : {},
        total: viewerShowCounts ? reaction?.total ?? 0 : undefined,
      },
    }
  })

  return { feed }
}

export async function addCookCheckReaction(
  supabase: SupabaseLike,
  input: { viewerProfileId: string; cookCheckId: string; reactionKey: string },
) {
  if (!validateReactionKey(input.reactionKey)) return { validationError: "Invalid reaction key." }
  const { data: cookCheck } = await getCookCheckById(supabase, input.cookCheckId)
  if (!cookCheck || cookCheck.status !== "published") return { validationError: "Cook check not available for reaction." }
  const { data: followSet } = await getAcceptedFollowMapForViewer(supabase, input.viewerProfileId)
  const canView = canViewerSeeVisibility({
    ownerProfileId: cookCheck.profile_id,
    viewerProfileId: input.viewerProfileId,
    visibility: cookCheck.visibility,
    viewerFollowsOwner: followSet?.has(cookCheck.profile_id) ?? false,
  })
  if (!canView) return { validationError: "Cannot react to this cook check." }
  const { data, error } = await upsertCookCheckReaction(supabase, {
    cookCheckId: input.cookCheckId,
    reactorProfileId: input.viewerProfileId,
    reactionKey: input.reactionKey,
  })
  if (error) return { error }
  return { reaction: data }
}

export async function removeCookCheckReaction(
  supabase: SupabaseLike,
  input: { viewerProfileId: string; cookCheckId: string; reactionKey: string },
) {
  if (!validateReactionKey(input.reactionKey)) return { validationError: "Invalid reaction key." }
  const { error } = await deleteCookCheckReaction(supabase, {
    cookCheckId: input.cookCheckId,
    reactorProfileId: input.viewerProfileId,
    reactionKey: input.reactionKey,
  })
  if (error) return { error }
  return { removed: true }
}
