import {
  getRetentionExpiresAt,
  isMediaPurpose,
  PRIVATE_PRODUCT_MEDIA_BUCKET,
  type MediaPurpose,
} from "@/lib/foundation/media"
import { normalizeUserFeaturePreferences } from "@/lib/foundation/preferences"

type SupabaseClientLike = {
  from: (table: string) => any
}

export function isValidOwnerScopedMediaPath(profileId: string, storagePath: string): boolean {
  if (!storagePath.startsWith(`${profileId}/`)) return false
  if (storagePath.includes("..")) return false
  return true
}

type CreateMediaAssetInput = {
  purpose: MediaPurpose
  storagePath: string
  mimeType?: string | null
  byteSize?: number | null
  derivedMetadata?: Record<string, unknown>
  sourceProductEventId?: string | null
}

export async function createMediaAsset(
  supabase: SupabaseClientLike,
  profileId: string,
  input: CreateMediaAssetInput,
) {
  if (!isMediaPurpose(input.purpose)) {
    return { validationError: "Unsupported media purpose" as const }
  }

  if (!isValidOwnerScopedMediaPath(profileId, input.storagePath)) {
    return { validationError: "storagePath must be scoped to the authenticated profile" as const }
  }

  const { data: preferenceRow } = await (supabase as any)
    .from("user_feature_preferences")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle()
  const preferences = normalizeUserFeaturePreferences(preferenceRow)

  const createdAt = new Date()
  const { data, error } = await (supabase as any)
    .from("media_assets")
    .insert({
      owner_profile_id: profileId,
      purpose: input.purpose,
      bucket: PRIVATE_PRODUCT_MEDIA_BUCKET,
      storage_path: input.storagePath,
      mime_type: input.mimeType ?? null,
      byte_size:
        typeof input.byteSize === "number" && Number.isFinite(input.byteSize)
          ? Math.max(0, Math.round(input.byteSize))
          : null,
      retention_expires_at: getRetentionExpiresAt(createdAt, preferences, input.purpose),
      derived_metadata: input.derivedMetadata ?? {},
      source_product_event_id: input.sourceProductEventId ?? null,
    })
    .select("*")
    .single()

  if (error) {
    return { error }
  }

  return { mediaAsset: data }
}
