import { isDuplicateDatabaseError } from "@/lib/foundation/product-events"

type SupabaseClientLike = {
  from: (table: string) => any
}

export type RecipeTryStatus = "attempted" | "succeeded" | "needs_tweaks"

type CreateRecipeTryInput = {
  recipeId?: string | null
  occurredOn: string
  status?: RecipeTryStatus
  sourceVerificationTaskId?: string | null
  feedbackTags?: string[]
  eligibleForStreak?: boolean
  eligibleForSocial?: boolean
  idempotencyKey?: string | null
}

export async function createRecipeTry(
  supabase: SupabaseClientLike,
  profileId: string,
  input: CreateRecipeTryInput,
) {
  const idempotencyKey = input.idempotencyKey?.trim() || null
  const { data, error } = await (supabase as any)
    .from("recipe_tries")
    .insert({
      profile_id: profileId,
      recipe_id: input.recipeId ?? null,
      occurred_on: input.occurredOn,
      status: input.status ?? "attempted",
      source_verification_task_id: input.sourceVerificationTaskId ?? null,
      feedback_tags: Array.isArray(input.feedbackTags) ? input.feedbackTags : [],
      eligible_for_streak: input.eligibleForStreak ?? false,
      eligible_for_social: input.eligibleForSocial ?? false,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single()

  if (isDuplicateDatabaseError(error) && idempotencyKey) {
    const { data: existing, error: lookupError } = await (supabase as any)
      .from("recipe_tries")
      .select("*")
      .eq("profile_id", profileId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (lookupError || !existing) return { error: lookupError ?? error }
    return { recipeTry: existing, duplicate: true as const }
  }

  if (error) return { error }
  return { recipeTry: data, duplicate: false as const }
}
