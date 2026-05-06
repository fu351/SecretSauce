import { normalizeUserFeaturePreferences } from "@/lib/foundation/preferences"
import { appendProductEvent } from "@/lib/foundation/product-events-service"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"
import { createSocialActivityProjection } from "@/lib/foundation/social-projections"
import { isSocialEnabledForProfile } from "@/lib/social/guards"
import { getCurrentWeekIndex, getDatesForWeek } from "@/lib/date-utils"
import {
  buildCookCheckProjectionPayload,
  canViewerSeeVisibility,
  isCookCheckExpired,
  isValidSocialVisibility,
  normalizeCaption,
  validateReactionKey,
} from "@/lib/social/helpers"
import {
  buildMealPlanShareProjectionPayload as buildMealPlanShareProjectionPayloadFromSprint3,
  calculateJourneyProgress as calculateSprint3JourneyProgress,
  canRemixMealPlan as canRemixMealPlanShare,
  canViewMealPlanShare as canViewSharedMealPlan,
  detectJourneyCompletion as detectSprint3JourneyCompletion,
  sanitizeJourneyProjectionPayload as sanitizeCookingJourneyProjectionPayload,
  sanitizeMealPlanForShare as sanitizeWeeklyMealPlanForShare,
  validateJourneyType as validateCookingJourneyType,
  validateMealPlanShareVisibility,
  type SanitizedMealPlanShare,
} from "@/lib/social/meal-plan-sharing"
import {
  archiveProjection,
  createCookingJourney,
  createCookCheckDraft,
  createJourneyEvent,
  createMealPlanRemix,
  createMealPlanShare,
  deleteCookCheckReaction,
  findExistingDraftBySource,
  findJourneyEventByIdempotency,
  findMealPlanShareByIdempotency,
  getAcceptedFollowMapForViewer,
  getCookingJourneyById,
  getCookCheckById,
  getMealPlanShareById,
  getOwnedProductEvent,
  getOwnedRecipeTry,
  getOwnedVerificationTask,
  insertMealScheduleRows,
  listCookingJourneys,
  getSocialPreferences,
  listExistingMealSlots,
  listCookCheckDrafts,
  listKitchenSyncProjections,
  listMealScheduleForWeek,
  listPublishedMealPlanShares,
  listReactionsForCookChecks,
  listRecipesByIds,
  updateCookingJourney,
  updateCookCheck,
  updateMealPlanShare,
  updateSocialPreferences,
  upsertCookCheckReaction,
} from "@/lib/social/repository"
import type { CookingJourneyType, CookCheckSourceType, JourneyEventType, SocialVisibility } from "@/lib/social/types"

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

async function buildWeeklyShareSummary(
  supabase: SupabaseLike,
  input: {
    profileId: string
    weekIndex: number
    title?: unknown
    estimatedTotalLabel?: unknown
    accomplishmentLabels?: unknown
  },
): Promise<{ summary: SanitizedMealPlanShare } | { validationError: string } | { error: unknown }> {
  const { data: meals, error: mealsError } = await listMealScheduleForWeek(supabase, input.profileId, input.weekIndex)
  if (mealsError) return { error: mealsError }
  if (!meals?.length) return { validationError: "No meals found for this week." }

  const recipeIds = [...new Set((meals as any[]).map((meal) => meal.recipe_id).filter(Boolean))]
  const { data: recipes, error: recipesError } = await listRecipesByIds(supabase, recipeIds)
  if (recipesError) return { error: recipesError }
  const recipesById = new Map((recipes ?? []).map((recipe: any) => [recipe.id, recipe]))
  const enrichedMeals = (meals as any[]).map((meal) => ({
    ...meal,
    recipe: recipesById.get(meal.recipe_id) ?? { id: meal.recipe_id, title: "Recipe" },
  }))

  return {
    summary: sanitizeWeeklyMealPlanForShare({
      title: input.title,
      weekIndex: input.weekIndex,
      meals: enrichedMeals,
      estimatedTotalLabel: input.estimatedTotalLabel,
      accomplishmentLabels: input.accomplishmentLabels,
    }),
  }
}

export async function shareMealPlanWeek(
  supabase: SupabaseLike,
  input: {
    profileId: string
    weekIndex: number
    title?: string | null
    visibility?: SocialVisibility
    estimatedTotalLabel?: string | null
    accomplishmentLabels?: unknown
    idempotencyKey?: string | null
  },
) {
  const weekIndex = Number(input.weekIndex)
  if (!Number.isInteger(weekIndex) || weekIndex <= 0) return { validationError: "Invalid meal plan week." }
  const visibility = validateMealPlanShareVisibility(input.visibility) ? input.visibility : "private"
  const idempotencyKey = input.idempotencyKey || buildIdempotencyKey(["meal-plan-share", input.profileId, weekIndex])

  const { data: existing } = await findMealPlanShareByIdempotency(supabase, input.profileId, idempotencyKey)
  if (existing) return { share: existing, duplicate: true as const }

  const summaryResult = await buildWeeklyShareSummary(supabase, {
    profileId: input.profileId,
    weekIndex,
    title: input.title,
    estimatedTotalLabel: input.estimatedTotalLabel,
    accomplishmentLabels: input.accomplishmentLabels,
  })
  if ("validationError" in summaryResult || "error" in summaryResult) return summaryResult

  const now = new Date().toISOString()
  const { data: share, error: shareError } = await createMealPlanShare(supabase, {
    ownerProfileId: input.profileId,
    sourceWeekIndex: weekIndex,
    title: summaryResult.summary.title,
    sanitizedSummary: summaryResult.summary as unknown as Record<string, unknown>,
    visibility,
    status: "published",
    idempotencyKey,
    publishedAt: now,
    metadata: { source: "weekly_meal_schedule" },
  })
  if (shareError) return { error: shareError }

  const projection = await createSocialActivityProjection(supabase, input.profileId, {
    eventType: "meal_plan_share.published",
    visibility,
    payload: buildMealPlanShareProjectionPayloadFromSprint3({
      shareId: share.id,
      summary: summaryResult.summary,
    }),
    occurredAt: now,
    publishedAt: now,
  })
  if ("validationError" in projection || ("error" in projection && projection.error)) return projection

  const { data: updated, error: updateError } = await updateMealPlanShare(supabase, share.id, {
    projection_id: projection.projection.id,
  })
  if (updateError) return { error: updateError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["meal-plan-share-published", input.profileId, share.id]),
    entityType: "meal_plan_share",
    entityId: share.id,
    metadata: { projectionId: projection.projection.id, weekIndex },
  })

  return { share: updated, projection: projection.projection, duplicate: false as const }
}

export async function archiveMealPlanShare(
  supabase: SupabaseLike,
  input: { profileId: string; shareId: string },
) {
  const { data: share } = await getMealPlanShareById(supabase, input.shareId)
  if (!share) return { validationError: "Meal plan share not found." }
  if (share.owner_profile_id !== input.profileId) return { validationError: "Only owner can archive this meal plan share." }
  const now = new Date().toISOString()
  const { data, error } = await updateMealPlanShare(supabase, input.shareId, {
    status: "archived",
    archived_at: now,
  })
  if (error) return { error }
  if (share.projection_id) await archiveProjection(supabase, share.projection_id)
  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["meal-plan-share-archived", input.profileId, input.shareId]),
    entityType: "meal_plan_share",
    entityId: input.shareId,
    metadata: { status: "archived" },
  })
  return { share: data }
}

export async function listVisibleMealPlanShares(supabase: SupabaseLike, viewerProfileId: string) {
  const [{ data: shares, error }, { data: followSet }] = await Promise.all([
    listPublishedMealPlanShares(supabase, 30),
    getAcceptedFollowMapForViewer(supabase, viewerProfileId),
  ])
  if (error) return { error }
  return {
    shares: (shares ?? []).filter((share: any) => canViewSharedMealPlan({
      ownerProfileId: share.owner_profile_id,
      viewerProfileId,
      visibility: share.visibility,
      status: share.status,
      viewerFollowsOwner: followSet?.has(share.owner_profile_id) ?? false,
    })),
  }
}

function dateStringForWeekOffset(weekIndex: number, dayOffset: number): string {
  const dates = getDatesForWeek(weekIndex)
  const date = dates[Math.max(0, Math.min(6, dayOffset))] ?? dates[0]
  return date.toISOString().split("T")[0]
}

export async function remixMealPlanShare(
  supabase: SupabaseLike,
  input: {
    profileId: string
    shareId: string
    targetWeekIndex?: number | null
    idempotencyKey?: string | null
  },
) {
  const targetWeekIndex = Number(input.targetWeekIndex) || getCurrentWeekIndex()
  const { data: share } = await getMealPlanShareById(supabase, input.shareId)
  if (!share) return { validationError: "Meal plan share not found." }
  const { data: followSet } = await getAcceptedFollowMapForViewer(supabase, input.profileId)
  if (!canRemixMealPlanShare({
    ownerProfileId: share.owner_profile_id,
    viewerProfileId: input.profileId,
    visibility: share.visibility,
    status: share.status,
    viewerFollowsOwner: followSet?.has(share.owner_profile_id) ?? false,
  })) {
    return { validationError: "Cannot remix this meal plan." }
  }

  const summary = share.sanitized_summary as SanitizedMealPlanShare
  const slots = Array.isArray(summary?.slots) ? summary.slots : []
  if (slots.length === 0) return { validationError: "Shared meal plan has no remixable meals." }

  const { data: existingSlots, error: existingError } = await listExistingMealSlots(supabase, input.profileId, targetWeekIndex)
  if (existingError) return { error: existingError }
  const occupied = new Set((existingSlots ?? []).map((slot: any) => `${slot.date}:${slot.meal_type}`))
  const rows = slots
    .map((slot) => ({
      user_id: input.profileId,
      recipe_id: slot.recipeId,
      week_index: targetWeekIndex,
      date: dateStringForWeekOffset(targetWeekIndex, slot.dayOffset),
      meal_type: slot.mealType,
    }))
    .filter((row) => !occupied.has(`${row.date}:${row.meal_type}`))

  const { data: inserted, error: insertError } = await insertMealScheduleRows(supabase, rows)
  if (insertError) return { error: insertError }
  const createdMealIds = (inserted ?? []).map((row: any) => row.id).filter(Boolean)

  const { data: remix, error: remixError } = await createMealPlanRemix(supabase, {
    originalShareId: input.shareId,
    remixerProfileId: input.profileId,
    targetWeekIndex,
    createdMealIds,
    idempotencyKey: input.idempotencyKey ?? buildIdempotencyKey(["meal-plan-remix", input.profileId, input.shareId, targetWeekIndex]),
    metadata: {
      skippedOccupiedSlots: slots.length - rows.length,
      sourceTitle: summary.title,
    },
  })
  if (remixError) return { error: remixError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["meal-plan-remixed", input.profileId, input.shareId, targetWeekIndex]),
    entityType: "meal_plan_remix",
    entityId: remix.id,
    metadata: { originalShareId: input.shareId, targetWeekIndex, createdMealCount: createdMealIds.length },
  })
  return { remix, createdMeals: inserted ?? [], skippedOccupiedSlots: slots.length - rows.length }
}

export async function listOwnCookingJourneys(supabase: SupabaseLike, profileId: string) {
  const { data, error } = await listCookingJourneys(supabase, profileId)
  if (error) return { error }
  return { journeys: data ?? [] }
}

export async function createCookingJourneyForProfile(
  supabase: SupabaseLike,
  input: {
    profileId: string
    title?: string | null
    journeyType?: CookingJourneyType | string | null
    targetCount?: number | null
    visibility?: SocialVisibility
  },
) {
  if (!validateCookingJourneyType(input.journeyType)) return { validationError: "Unsupported journey type." }
  const targetCount = Math.max(1, Math.min(365, Math.floor(Number(input.targetCount) || 1)))
  const title = (typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Cooking Journey").slice(0, 80)
  const visibility = validateMealPlanShareVisibility(input.visibility) ? input.visibility : "private"
  const { data, error } = await createCookingJourney(supabase, {
    profile_id: input.profileId,
    title,
    journey_type: input.journeyType,
    target_count: targetCount,
    current_progress: 0,
    status: "active",
    visibility,
    metadata: {},
  })
  if (error) return { error }
  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["journey-created", input.profileId, data.id]),
    entityType: "cooking_journey",
    entityId: data.id,
    metadata: { status: "active", journeyType: input.journeyType },
  })
  return { journey: data }
}

export async function recordJourneyProgressEvent(
  supabase: SupabaseLike,
  input: {
    profileId: string
    journeyId: string
    eventType?: JourneyEventType | string | null
    progressDelta?: number | null
    sourceRecipeTryId?: string | null
    sourceWeekIndex?: number | null
    idempotencyKey?: string | null
  },
) {
  const { data: journey } = await getCookingJourneyById(supabase, input.journeyId)
  if (!journey) return { validationError: "Journey not found." }
  if (journey.profile_id !== input.profileId) return { validationError: "Only owner can update this journey." }
  if (journey.status !== "active") return { validationError: "Only active journeys can be updated." }

  const eventType = typeof input.eventType === "string" ? input.eventType : "manual_progress"
  if (!["recipe_try", "streak_day", "meal_plan", "manual_progress"].includes(eventType)) {
    return { validationError: "Unsupported journey event type." }
  }
  if (input.sourceRecipeTryId) {
    const { data: recipeTry } = await getOwnedRecipeTry(supabase, input.profileId, input.sourceRecipeTryId)
    if (!recipeTry) return { validationError: "recipeTry source is not owned by profile." }
  }

  const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey([
    "journey-event",
    input.profileId,
    input.journeyId,
    eventType,
    input.sourceRecipeTryId ?? input.sourceWeekIndex ?? Date.now(),
  ])
  const { data: existingEvent } = await findJourneyEventByIdempotency(supabase, input.journeyId, idempotencyKey)
  if (existingEvent) return { journey, duplicate: true as const }

  const progressDelta = Math.max(1, Math.min(31, Math.floor(Number(input.progressDelta) || 1)))
  const progress = calculateSprint3JourneyProgress({
    currentProgress: journey.current_progress,
    targetCount: journey.target_count,
    delta: progressDelta,
  })
  const { data: event, error: eventError } = await createJourneyEvent(supabase, {
    journey_id: input.journeyId,
    profile_id: input.profileId,
    event_type: eventType,
    source_recipe_try_id: input.sourceRecipeTryId ?? null,
    source_week_index: input.sourceWeekIndex ?? null,
    progress_delta: progressDelta,
    idempotency_key: idempotencyKey,
    metadata: {},
  })
  if (eventError) return { error: eventError }

  const { data: updated, error: updateError } = await updateCookingJourney(supabase, input.journeyId, {
    current_progress: progress.currentProgress,
  })
  if (updateError) return { error: updateError }
  return { journey: updated, event, completed: detectSprint3JourneyCompletion(progress) }
}

export async function completeCookingJourney(
  supabase: SupabaseLike,
  input: { profileId: string; journeyId: string; visibility?: SocialVisibility },
) {
  const { data: journey } = await getCookingJourneyById(supabase, input.journeyId)
  if (!journey) return { validationError: "Journey not found." }
  if (journey.profile_id !== input.profileId) return { validationError: "Only owner can complete this journey." }
  if (journey.status === "archived") return { validationError: "Archived journeys cannot be completed." }
  const visibility = validateMealPlanShareVisibility(input.visibility) ? input.visibility : journey.visibility
  const now = new Date().toISOString()
  const completedProgress = Math.max(Number(journey.current_progress) || 0, Number(journey.target_count) || 1)

  const projection = await createSocialActivityProjection(supabase, input.profileId, {
    eventType: "cooking_journey.published",
    visibility,
    payload: sanitizeCookingJourneyProjectionPayload({
      journeyId: journey.id,
      title: journey.title,
      journeyType: journey.journey_type,
      currentProgress: completedProgress,
      targetCount: journey.target_count,
    }),
    occurredAt: now,
    publishedAt: now,
  })
  if ("validationError" in projection || ("error" in projection && projection.error)) return projection

  const { data: updated, error: updateError } = await updateCookingJourney(supabase, input.journeyId, {
    current_progress: completedProgress,
    status: "completed",
    visibility,
    completed_at: now,
    projection_id: projection.projection.id,
  })
  if (updateError) return { error: updateError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "social.projection_published",
    idempotencyKey: buildIdempotencyKey(["journey-completed", input.profileId, input.journeyId]),
    entityType: "cooking_journey",
    entityId: input.journeyId,
    metadata: { projectionId: projection.projection.id, status: "completed" },
  })
  return { journey: updated, projection: projection.projection }
}
