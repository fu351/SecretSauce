import type { UserFeaturePreferences } from "./preferences"

export const MEDIA_PURPOSES = [
  "receipt",
  "meal_verification",
  "pantry_scan",
  "social_post_derivative",
] as const

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]

export const PRIVATE_PRODUCT_MEDIA_BUCKET = "private-product-media"

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === "string" && MEDIA_PURPOSES.includes(value as MediaPurpose)
}

export function getRetentionExpiresAt(
  createdAt: Date,
  preferences: Pick<UserFeaturePreferences, "rawMediaRetentionDays">,
  purpose: MediaPurpose,
): string | null {
  if (purpose === "social_post_derivative") return null
  const expiresAt = new Date(createdAt)
  expiresAt.setDate(expiresAt.getDate() + preferences.rawMediaRetentionDays)
  return expiresAt.toISOString()
}

export function buildOwnerScopedStoragePath(profileId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-")
  return `${profileId}/${Date.now()}-${sanitized || "media"}`
}
