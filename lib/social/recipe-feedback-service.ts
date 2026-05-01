import { appendProductEvent } from "@/lib/foundation/product-events-service"
import { isDuplicateDatabaseError } from "@/lib/foundation/product-events"
import { isSocialEnabledForProfile } from "@/lib/social/guards"
import { getOwnedRecipeTry } from "@/lib/social/repository"
import {
  RECIPE_FEEDBACK_TAGS,
  buildRecipeFeedbackIdempotencyKey,
  sanitizeRecipePeerScoreForClient,
  validateRecipeFeedbackTags,
  validateRecipeTryFeedbackOutcome,
  type RecipeFeedbackOutcome,
  type SanitizedPeerScore,
} from "@/lib/social/recipe-feedback"

type SupabaseLike = { from: (table: string) => any }

export type SubmitFeedbackInput = {
  profileId: string
  recipeTryId: string
  outcome: unknown
  tags?: unknown
  shareApproved?: unknown
  idempotencyKey?: string | null
}

export type SubmitFeedbackResult =
  | { feedback: Record<string, unknown>; duplicate?: boolean }
  | { validationError: string }
  | { error: unknown }

/**
 * Submit structured feedback for an owned recipe_try. Enforces:
 *  - recipe_try must exist and belong to the caller
 *  - outcome must be a valid enum
 *  - tags must all be in the locked RECIPE_FEEDBACK_TAGS list
 *  - skipped_feedback must carry no tags
 *  - one feedback row per recipe_try (idempotent on re-submit with same key)
 */
export async function submitRecipeTryFeedback(
  supabase: SupabaseLike,
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  if (!validateRecipeTryFeedbackOutcome(input.outcome)) {
    return { validationError: "Unknown feedback outcome" }
  }
  const outcome = input.outcome as RecipeFeedbackOutcome
  const tagsResult = validateRecipeFeedbackTags(input.tags, outcome)
  if (!tagsResult.ok) return { validationError: tagsResult.error }

  const { data: recipeTry, error: tryError } = await getOwnedRecipeTry(
    supabase,
    input.profileId,
    input.recipeTryId,
  )
  if (tryError) return { error: tryError }
  if (!recipeTry) return { validationError: "Recipe try not found or not owned by caller" }

  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    buildRecipeFeedbackIdempotencyKey(input.profileId, input.recipeTryId)

  const insertPayload = {
    profile_id: input.profileId,
    recipe_try_id: input.recipeTryId,
    recipe_id: recipeTry.recipe_id ?? null,
    outcome,
    feedback_tags: tagsResult.tags,
    share_approved: input.shareApproved === true,
    idempotency_key: idempotencyKey,
    metadata: {},
  }

  const { data, error } = await (supabase as any)
    .from("recipe_try_feedback")
    .insert(insertPayload)
    .select("*")
    .single()

  if (isDuplicateDatabaseError(error)) {
    // Re-submit with same idempotency key or recipe_try_id: return the existing row.
    const { data: existing, error: lookupError } = await (supabase as any)
      .from("recipe_try_feedback")
      .select("*")
      .eq("profile_id", input.profileId)
      .eq("recipe_try_id", input.recipeTryId)
      .maybeSingle()
    if (lookupError || !existing) return { error: lookupError ?? error }
    return { feedback: existing, duplicate: true }
  }
  if (error) return { error }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "recipe_try.logged",
    idempotencyKey: `${idempotencyKey}:event`,
    metadata: { outcome, tagCount: tagsResult.tags.length },
  })

  return { feedback: data }
}

export async function skipRecipeTryFeedback(
  supabase: SupabaseLike,
  input: { profileId: string; recipeTryId: string },
): Promise<SubmitFeedbackResult> {
  return submitRecipeTryFeedback(supabase, {
    profileId: input.profileId,
    recipeTryId: input.recipeTryId,
    outcome: "skipped_feedback",
    tags: [],
  })
}

export type PeerScoreResult =
  | { peerScore: SanitizedPeerScore }
  | { error: unknown }

/**
 * Compute Peer Success Score for a recipe by aggregating submitted feedback.
 * Only 'succeeded' and 'needed_tweaks' count toward the denominator —
 * 'skipped_feedback' never affects the score (spec constraint 8).
 */
export async function getRecipePeerScore(
  supabase: SupabaseLike,
  recipeId: string,
): Promise<PeerScoreResult> {
  const { data, error } = await (supabase as any)
    .from("recipe_try_feedback")
    .select("outcome, feedback_tags")
    .eq("recipe_id", recipeId)
    .in("outcome", ["succeeded", "needed_tweaks"])

  if (error) return { error }

  const rows = (data ?? []) as Array<{ outcome: RecipeFeedbackOutcome; feedback_tags: string[] }>
  let succeeded = 0
  let neededTweaks = 0
  const tagCounts: Record<string, number> = {}
  for (const row of rows) {
    if (row.outcome === "succeeded") succeeded += 1
    else if (row.outcome === "needed_tweaks") neededTweaks += 1
    const seenInRow = new Set<string>()
    for (const tag of row.feedback_tags ?? []) {
      // Count each tag once per feedback row, and only lock-listed tags.
      if (seenInRow.has(tag)) continue
      if (!RECIPE_FEEDBACK_TAGS.includes(tag as any)) continue
      seenInRow.add(tag)
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
  }

  return {
    peerScore: sanitizeRecipePeerScoreForClient({
      recipeId,
      counts: { succeeded, neededTweaks, skipped: 0 },
      tagCounts,
    }),
  }
}

export async function getRecipePeerScoresBatch(
  supabase: SupabaseLike,
  recipeIds: string[],
): Promise<{ peerScores: SanitizedPeerScore[] } | { error: unknown }> {
  const uniqueIds = Array.from(new Set(recipeIds.filter((id): id is string => typeof id === "string" && id.length > 0)))
  if (uniqueIds.length === 0) return { peerScores: [] }

  const { data, error } = await (supabase as any)
    .from("recipe_try_feedback")
    .select("recipe_id, outcome, feedback_tags")
    .in("recipe_id", uniqueIds)
    .in("outcome", ["succeeded", "needed_tweaks"])

  if (error) return { error }

  type Row = { recipe_id: string; outcome: RecipeFeedbackOutcome; feedback_tags: string[] }
  const byRecipe = new Map<string, { succeeded: number; neededTweaks: number; tagCounts: Record<string, number> }>()
  for (const id of uniqueIds) byRecipe.set(id, { succeeded: 0, neededTweaks: 0, tagCounts: {} })

  for (const row of (data ?? []) as Row[]) {
    const bucket = byRecipe.get(row.recipe_id)
    if (!bucket) continue
    if (row.outcome === "succeeded") bucket.succeeded += 1
    else if (row.outcome === "needed_tweaks") bucket.neededTweaks += 1
    const seenInRow = new Set<string>()
    for (const tag of row.feedback_tags ?? []) {
      if (seenInRow.has(tag)) continue
      if (!RECIPE_FEEDBACK_TAGS.includes(tag as any)) continue
      seenInRow.add(tag)
      bucket.tagCounts[tag] = (bucket.tagCounts[tag] ?? 0) + 1
    }
  }

  const peerScores: SanitizedPeerScore[] = []
  for (const [recipeId, bucket] of byRecipe.entries()) {
    peerScores.push(
      sanitizeRecipePeerScoreForClient({
        recipeId,
        counts: { succeeded: bucket.succeeded, neededTweaks: bucket.neededTweaks, skipped: 0 },
        tagCounts: bucket.tagCounts,
      }),
    )
  }
  return { peerScores }
}

export async function assertSocialEnabledForFeedback(supabase: SupabaseLike, profileId: string) {
  return isSocialEnabledForProfile(supabase, profileId)
}
