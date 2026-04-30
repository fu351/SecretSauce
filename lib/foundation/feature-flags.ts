export const FOUNDATION_FEATURE_FLAGS = {
  budget_tracking: "secret-sauce-budget-foundation",
  gamification_streaks: "secret-sauce-streaks-foundation",
  social_layer: "secret-sauce-social-foundation",
  pantry_tracking: "secret-sauce-pantry-foundation",
  photo_verification: "secret-sauce-photo-verification",
  receipt_scanning: "secret-sauce-receipt-scanning",
  pantry_ai_scan: "secret-sauce-pantry-ai-scan",
  cook_checks: "secret-sauce-cook-checks",
  campus_cups: "secret-sauce-campus-cups",
  reward_vault: "secret-sauce-reward-vault",
} as const

export type FoundationFeatureFlag = keyof typeof FOUNDATION_FEATURE_FLAGS
export type FoundationFeatureFlagKey = (typeof FOUNDATION_FEATURE_FLAGS)[FoundationFeatureFlag]

const FOUNDATION_FEATURE_FLAG_NAMES = Object.keys(FOUNDATION_FEATURE_FLAGS) as FoundationFeatureFlag[]

export function isFoundationFeatureFlag(value: unknown): value is FoundationFeatureFlag {
  return typeof value === "string" && FOUNDATION_FEATURE_FLAG_NAMES.includes(value as FoundationFeatureFlag)
}

export function getFoundationFeatureFlagKey(flag: FoundationFeatureFlag): FoundationFeatureFlagKey {
  return FOUNDATION_FEATURE_FLAGS[flag]
}

export function readBooleanFlagOverride(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function getServerFeatureFallback(flag: FoundationFeatureFlag): boolean {
  const envKey = `NEXT_PUBLIC_${FOUNDATION_FEATURE_FLAGS[flag].toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
  return readBooleanFlagOverride(process.env[envKey], true)
}

export function resolveFoundationFeatureEnabled(
  flag: FoundationFeatureFlag,
  posthogValue: boolean | null | undefined,
): boolean {
  if (typeof posthogValue === "boolean") {
    return posthogValue
  }
  return getServerFeatureFallback(flag)
}
