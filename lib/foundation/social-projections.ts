import {
  assertSafeSocialProjectionPayload,
  isSocialProjectionEventType,
  type SocialProjectionEventType,
} from "@/lib/foundation/privacy"

type SupabaseClientLike = {
  from: (table: string) => any
}

export type SocialVisibility = "private" | "followers" | "public"

type CreateSocialProjectionInput = {
  eventType: SocialProjectionEventType
  visibility?: SocialVisibility
  payload: Record<string, unknown>
  sourceProductEventId?: string | null
  occurredAt?: string
  publishedAt?: string | null
  expiresAt?: string | null
}

export async function createSocialActivityProjection(
  supabase: SupabaseClientLike,
  profileId: string,
  input: CreateSocialProjectionInput,
) {
  if (!isSocialProjectionEventType(input.eventType)) {
    return { validationError: "Unsupported social projection event type" as const }
  }

  try {
    assertSafeSocialProjectionPayload(input.payload)
  } catch (error) {
    return { validationError: error instanceof Error ? error.message : "Unsafe social projection payload" }
  }

  const { data, error } = await (supabase as any)
    .from("social_activity_projections")
    .insert({
      owner_profile_id: profileId,
      source_product_event_id: input.sourceProductEventId ?? null,
      event_type: input.eventType,
      visibility: input.visibility ?? "private",
      payload: input.payload,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      published_at: input.publishedAt ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single()

  if (error) return { error }
  return { projection: data }
}
