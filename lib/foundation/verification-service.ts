import { isDuplicateDatabaseError } from "@/lib/foundation/product-events"
import {
  isVerificationFeatureArea,
  isVerificationSourceType,
  resolveUserConfirmationStatus,
  resolveVerificationStatus,
} from "@/lib/foundation/verification"

type SupabaseClientLike = {
  from: (table: string) => any
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

type CreateVerificationInput = {
  featureArea: string
  sourceType: string
  confidence?: number | null
  confirmationMode?: string
  mediaAssetId?: string | null
  sourceProductEventId?: string | null
  proposedOutput?: Record<string, unknown>
  aiMetadata?: Record<string, unknown>
  idempotencyKey?: string | null
  confirmationItems?: Array<{ itemType: string; label?: string; proposedValue?: Record<string, unknown> }>
}

export async function createVerificationTaskWithRouting(
  supabase: SupabaseClientLike,
  profileId: string,
  input: CreateVerificationInput,
) {
  if (!isVerificationFeatureArea(input.featureArea)) {
    return { validationError: "Unsupported verification feature area" as const }
  }
  if (!isVerificationSourceType(input.sourceType)) {
    return { validationError: "Unsupported verification source type" as const }
  }

  const confidence =
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(1, input.confidence))
      : null
  const status = resolveVerificationStatus(confidence, { alwaysAsk: input.confirmationMode === "always_ask" })
  const idempotencyKey = input.idempotencyKey?.trim() || null

  const { data, error } = await (supabase as any)
    .from("verification_tasks")
    .insert({
      owner_profile_id: profileId,
      feature_area: input.featureArea,
      source_type: input.sourceType,
      status,
      confidence,
      media_asset_id: input.mediaAssetId ?? null,
      source_product_event_id: input.sourceProductEventId ?? null,
      proposed_output: toObject(input.proposedOutput),
      ai_metadata: toObject(input.aiMetadata),
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single()

  if (isDuplicateDatabaseError(error) && idempotencyKey) {
    const { data: existing, error: lookupError } = await (supabase as any)
      .from("verification_tasks")
      .select("*")
      .eq("owner_profile_id", profileId)
      .eq("feature_area", input.featureArea)
      .eq("source_type", input.sourceType)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (lookupError || !existing) return { error: lookupError ?? error }
    return { verificationTask: existing, duplicate: true as const }
  }
  if (error || !data) return { error }

  if (status === "needs_confirmation" && Array.isArray(input.confirmationItems) && input.confirmationItems.length > 0) {
    const rows = input.confirmationItems
      .filter((item) => typeof item.itemType === "string" && item.itemType.trim().length > 0)
      .map((item) => ({
        owner_profile_id: profileId,
        verification_task_id: data.id,
        item_type: item.itemType.trim(),
        label: item.label ?? null,
        proposed_value: toObject(item.proposedValue),
      }))

    if (rows.length > 0) {
      const { error: confirmationError } = await (supabase as any).from("confirmation_items").insert(rows)
      if (confirmationError) return { error: confirmationError }
    }
  }

  return { verificationTask: data, duplicate: false as const }
}

export async function applyUserVerificationDecision(
  supabase: SupabaseClientLike,
  profileId: string,
  taskId: string,
  decision: unknown,
  confirmedOutput: unknown,
) {
  const status = resolveUserConfirmationStatus(decision)
  if (!status) {
    return { validationError: "decision must be confirm or reject" as const }
  }

  const { data, error } = await (supabase as any)
    .from("verification_tasks")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewer_profile_id: profileId,
      user_decision: {
        decision,
        output: toObject(confirmedOutput),
      },
    })
    .eq("id", taskId)
    .eq("owner_profile_id", profileId)
    .select("*")
    .single()

  if (error) return { error }

  const confirmationStatus = status === "user_confirmed" ? "confirmed" : "rejected"
  await (supabase as any)
    .from("confirmation_items")
    .update({ status: confirmationStatus, confirmed_value: toObject(confirmedOutput) })
    .eq("verification_task_id", taskId)
    .eq("owner_profile_id", profileId)
    .eq("status", "pending")

  return { verificationTask: data }
}
