import type { CookCheckReaction, CookCheckSourceType, SocialVisibility } from "@/lib/social/types"

type SupabaseLike = { from: (table: string) => any }

export async function getSocialPreferences(supabase: SupabaseLike, profileId: string) {
  return (supabase as any).from("user_feature_preferences").select("*").eq("profile_id", profileId).maybeSingle()
}

export async function updateSocialPreferences(
  supabase: SupabaseLike,
  profileId: string,
  input: Partial<{ social_enabled: boolean; social_visibility_default: SocialVisibility; show_reaction_counts: boolean }>,
) {
  return (supabase as any)
    .from("user_feature_preferences")
    .upsert({ profile_id: profileId, ...input, updated_at: new Date().toISOString() }, { onConflict: "profile_id" })
    .select("*")
    .single()
}

export async function getOwnedRecipeTry(supabase: SupabaseLike, profileId: string, recipeTryId: string) {
  return (supabase as any).from("recipe_tries").select("*").eq("profile_id", profileId).eq("id", recipeTryId).maybeSingle()
}

export async function getOwnedVerificationTask(supabase: SupabaseLike, profileId: string, verificationTaskId: string) {
  return (supabase as any)
    .from("verification_tasks")
    .select("*")
    .eq("owner_profile_id", profileId)
    .eq("id", verificationTaskId)
    .maybeSingle()
}

export async function getOwnedProductEvent(supabase: SupabaseLike, profileId: string, productEventId: string) {
  return (supabase as any).from("product_events").select("*").eq("profile_id", profileId).eq("id", productEventId).maybeSingle()
}

export async function findExistingDraftBySource(
  supabase: SupabaseLike,
  profileId: string,
  input: { sourceRecipeTryId?: string | null; sourceVerificationTaskId?: string | null; sourceProductEventId?: string | null },
) {
  let query = (supabase as any).from("cook_checks").select("*").eq("profile_id", profileId).in("status", ["draft", "published"])
  if (input.sourceRecipeTryId) query = query.eq("source_recipe_try_id", input.sourceRecipeTryId)
  if (input.sourceVerificationTaskId) query = query.eq("source_verification_task_id", input.sourceVerificationTaskId)
  if (input.sourceProductEventId) query = query.eq("source_product_event_id", input.sourceProductEventId)
  return query.maybeSingle()
}

export async function createCookCheckDraft(
  supabase: SupabaseLike,
  input: {
    profileId: string
    sourceType: CookCheckSourceType
    sourceRecipeTryId?: string | null
    sourceVerificationTaskId?: string | null
    sourceProductEventId?: string | null
    visibility: SocialVisibility
    caption?: string | null
    idempotencyKey?: string | null
    expiresAt?: string | null
  },
) {
  return (supabase as any)
    .from("cook_checks")
    .insert({
      profile_id: input.profileId,
      source_type: input.sourceType,
      source_recipe_try_id: input.sourceRecipeTryId ?? null,
      source_verification_task_id: input.sourceVerificationTaskId ?? null,
      source_product_event_id: input.sourceProductEventId ?? null,
      status: "draft",
      visibility: input.visibility,
      caption: input.caption ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single()
}

export async function listCookCheckDrafts(supabase: SupabaseLike, profileId: string) {
  return (supabase as any)
    .from("cook_checks")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
}

export async function getCookCheckById(supabase: SupabaseLike, cookCheckId: string) {
  return (supabase as any).from("cook_checks").select("*").eq("id", cookCheckId).maybeSingle()
}

export async function updateCookCheck(
  supabase: SupabaseLike,
  cookCheckId: string,
  input: Partial<{
    caption: string | null
    visibility: SocialVisibility
    status: "published" | "skipped" | "expired"
    projection_id: string | null
    published_at: string | null
    skipped_at: string | null
    expires_at: string | null
  }>,
) {
  return (supabase as any).from("cook_checks").update(input).eq("id", cookCheckId).select("*").single()
}

export async function listKitchenSyncProjections(supabase: SupabaseLike, limit = 40) {
  return (supabase as any)
    .from("social_activity_projections")
    .select("id, owner_profile_id, event_type, visibility, payload, occurred_at, published_at, expires_at")
    .in("event_type", ["cook_check.approved", "meal_plan_share.published", "cooking_journey.published"])
    .order("occurred_at", { ascending: false })
    .limit(limit)
}

export async function getAcceptedFollowMapForViewer(supabase: SupabaseLike, viewerProfileId: string) {
  const { data, error } = await (supabase as any)
    .from("follow_requests")
    .select("following_id")
    .eq("follower_id", viewerProfileId)
    .eq("status", "accepted")
  return { data: new Set((data ?? []).map((row: any) => row.following_id as string)), error }
}

export async function listReactionsForCookChecks(supabase: SupabaseLike, cookCheckIds: string[]) {
  if (cookCheckIds.length === 0) return { data: [], error: null }
  return (supabase as any)
    .from("cook_check_reactions")
    .select("cook_check_id, reactor_profile_id, reaction_key")
    .in("cook_check_id", cookCheckIds)
}

export async function upsertCookCheckReaction(
  supabase: SupabaseLike,
  input: { cookCheckId: string; reactorProfileId: string; reactionKey: CookCheckReaction },
) {
  return (supabase as any)
    .from("cook_check_reactions")
    .insert({
      cook_check_id: input.cookCheckId,
      reactor_profile_id: input.reactorProfileId,
      reaction_key: input.reactionKey,
    })
    .select("*")
    .single()
}

export async function deleteCookCheckReaction(
  supabase: SupabaseLike,
  input: { cookCheckId: string; reactorProfileId: string; reactionKey: CookCheckReaction },
) {
  return (supabase as any)
    .from("cook_check_reactions")
    .delete()
    .eq("cook_check_id", input.cookCheckId)
    .eq("reactor_profile_id", input.reactorProfileId)
    .eq("reaction_key", input.reactionKey)
}

export async function listMealScheduleForWeek(supabase: SupabaseLike, profileId: string, weekIndex: number) {
  return (supabase as any)
    .from("meal_schedule")
    .select("id, user_id, recipe_id, date, meal_type, week_index")
    .eq("user_id", profileId)
    .eq("week_index", weekIndex)
    .order("date", { ascending: true })
}

export async function listRecipesByIds(supabase: SupabaseLike, recipeIds: string[]) {
  if (recipeIds.length === 0) return { data: [], error: null }
  return (supabase as any)
    .from("recipes")
    .select("id, title, tags, protein, meal_type")
    .in("id", recipeIds)
}

export async function findMealPlanShareByIdempotency(supabase: SupabaseLike, profileId: string, idempotencyKey: string) {
  return (supabase as any)
    .from("meal_plan_shares")
    .select("*")
    .eq("owner_profile_id", profileId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
}

export async function createMealPlanShare(supabase: SupabaseLike, input: {
  ownerProfileId: string
  sourceWeekIndex: number
  title: string
  sanitizedSummary: Record<string, unknown>
  visibility: SocialVisibility
  status: "draft" | "published"
  idempotencyKey?: string | null
  publishedAt?: string | null
  metadata?: Record<string, unknown>
}) {
  return (supabase as any)
    .from("meal_plan_shares")
    .insert({
      owner_profile_id: input.ownerProfileId,
      source_week_index: input.sourceWeekIndex,
      title: input.title,
      sanitized_summary: input.sanitizedSummary,
      visibility: input.visibility,
      status: input.status,
      idempotency_key: input.idempotencyKey ?? null,
      published_at: input.publishedAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single()
}

export async function getMealPlanShareById(supabase: SupabaseLike, shareId: string) {
  return (supabase as any).from("meal_plan_shares").select("*").eq("id", shareId).maybeSingle()
}

export async function updateMealPlanShare(supabase: SupabaseLike, shareId: string, input: Record<string, unknown>) {
  return (supabase as any).from("meal_plan_shares").update(input).eq("id", shareId).select("*").single()
}

export async function archiveProjection(supabase: SupabaseLike, projectionId: string) {
  return (supabase as any)
    .from("social_activity_projections")
    .update({ visibility: "private", expires_at: new Date().toISOString() })
    .eq("id", projectionId)
    .select("*")
    .single()
}

export async function listPublishedMealPlanShares(supabase: SupabaseLike, limit = 30) {
  return (supabase as any)
    .from("meal_plan_shares")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit)
}

export async function listExistingMealSlots(supabase: SupabaseLike, profileId: string, weekIndex: number) {
  return (supabase as any)
    .from("meal_schedule")
    .select("id, date, meal_type")
    .eq("user_id", profileId)
    .eq("week_index", weekIndex)
}

export async function insertMealScheduleRows(supabase: SupabaseLike, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return { data: [], error: null }
  return (supabase as any).from("meal_schedule").insert(rows).select("*")
}

export async function createMealPlanRemix(supabase: SupabaseLike, input: {
  originalShareId: string
  remixerProfileId: string
  targetWeekIndex: number
  createdMealIds: string[]
  idempotencyKey?: string | null
  metadata?: Record<string, unknown>
}) {
  return (supabase as any)
    .from("meal_plan_remixes")
    .insert({
      original_share_id: input.originalShareId,
      remixer_profile_id: input.remixerProfileId,
      target_week_index: input.targetWeekIndex,
      created_meal_ids: input.createdMealIds,
      idempotency_key: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single()
}

export async function listCookingJourneys(supabase: SupabaseLike, profileId: string) {
  return (supabase as any)
    .from("cooking_journeys")
    .select("*")
    .eq("profile_id", profileId)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
}

export async function createCookingJourney(supabase: SupabaseLike, input: Record<string, unknown>) {
  return (supabase as any).from("cooking_journeys").insert(input).select("*").single()
}

export async function getCookingJourneyById(supabase: SupabaseLike, journeyId: string) {
  return (supabase as any).from("cooking_journeys").select("*").eq("id", journeyId).maybeSingle()
}

export async function updateCookingJourney(supabase: SupabaseLike, journeyId: string, input: Record<string, unknown>) {
  return (supabase as any).from("cooking_journeys").update(input).eq("id", journeyId).select("*").single()
}

export async function findJourneyEventByIdempotency(supabase: SupabaseLike, journeyId: string, idempotencyKey: string) {
  return (supabase as any)
    .from("journey_events")
    .select("*")
    .eq("journey_id", journeyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
}

export async function createJourneyEvent(supabase: SupabaseLike, input: Record<string, unknown>) {
  return (supabase as any).from("journey_events").insert(input).select("*").single()
}
