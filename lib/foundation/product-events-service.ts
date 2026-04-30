import {
  isDuplicateDatabaseError,
  isJsonObject,
  isProductEventType,
  type ProductEventType,
} from "@/lib/foundation/product-events"

type SupabaseClientLike = {
  from: (table: string) => any
}

type ProductEventInput = {
  eventType: ProductEventType
  source?: string
  idempotencyKey: string
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown>
}

export async function appendProductEvent(
  supabase: SupabaseClientLike,
  profileId: string,
  input: ProductEventInput,
) {
  if (!isProductEventType(input.eventType)) {
    return { validationError: "Unsupported product event type" as const }
  }

  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey) {
    return { validationError: "idempotencyKey is required" as const }
  }

  const insertPayload = {
    actor_profile_id: profileId,
    event_type: input.eventType,
    source: input.source?.trim() || "server",
    idempotency_key: idempotencyKey,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: isJsonObject(input.metadata) ? input.metadata : {},
  }

  const { data, error } = await (supabase as any)
    .from("product_events")
    .insert(insertPayload)
    .select("*")
    .single()

  if (isDuplicateDatabaseError(error)) {
    const { data: existing, error: lookupError } = await (supabase as any)
      .from("product_events")
      .select("*")
      .eq("actor_profile_id", profileId)
      .eq("event_type", input.eventType)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()

    if (lookupError || !existing) {
      return { error: lookupError ?? error }
    }

    return { event: existing, duplicate: true as const }
  }

  if (error) {
    return { error }
  }

  return { event: data, duplicate: false as const }
}
