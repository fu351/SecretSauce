export const VERIFICATION_STATUSES = [
  "pending",
  "auto_accepted",
  "needs_confirmation",
  "user_confirmed",
  "user_rejected",
  "expired",
] as const

export const VERIFICATION_FEATURE_AREAS = [
  "budget",
  "streaks",
  "social",
  "pantry",
  "recipe",
  "shopping",
] as const

export const VERIFICATION_SOURCE_TYPES = [
  "manual",
  "receipt",
  "meal_photo",
  "pantry_photo",
  "recipe_try",
  "system",
] as const

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]
export type VerificationFeatureArea = (typeof VERIFICATION_FEATURE_AREAS)[number]
export type VerificationSourceType = (typeof VERIFICATION_SOURCE_TYPES)[number]

export const DEFAULT_VERIFICATION_THRESHOLDS = {
  autoAccept: 0.85,
  needsConfirmationFloor: 0,
}

export function isVerificationFeatureArea(value: unknown): value is VerificationFeatureArea {
  return typeof value === "string" && VERIFICATION_FEATURE_AREAS.includes(value as VerificationFeatureArea)
}

export function isVerificationSourceType(value: unknown): value is VerificationSourceType {
  return typeof value === "string" && VERIFICATION_SOURCE_TYPES.includes(value as VerificationSourceType)
}

export function resolveVerificationStatus(
  confidence: number | null | undefined,
  options: { alwaysAsk?: boolean; autoAcceptThreshold?: number } = {},
): VerificationStatus {
  if (options.alwaysAsk) return "needs_confirmation"
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return "pending"
  const clamped = Math.max(0, Math.min(1, confidence))
  return clamped >= (options.autoAcceptThreshold ?? DEFAULT_VERIFICATION_THRESHOLDS.autoAccept)
    ? "auto_accepted"
    : "needs_confirmation"
}

export function resolveUserConfirmationStatus(decision: unknown): Extract<
  VerificationStatus,
  "user_confirmed" | "user_rejected"
> | null {
  if (decision === "confirm" || decision === "confirmed" || decision === true) return "user_confirmed"
  if (decision === "reject" || decision === "rejected" || decision === false) return "user_rejected"
  return null
}
