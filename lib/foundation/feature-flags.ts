export const FOUNDATION_FEATURE_AREAS = [
  "budget",
  "streaks",
  "social",
  "pantry",
] as const

export type FoundationFeatureArea = (typeof FOUNDATION_FEATURE_AREAS)[number]

export const FOUNDATION_FEATURE_FLAGS: Record<FoundationFeatureArea, string> = {
  budget: "secret-sauce-budget-foundation",
  streaks: "secret-sauce-streaks-foundation",
  social: "secret-sauce-social-foundation",
  pantry: "secret-sauce-pantry-foundation",
}

export function isFoundationFeatureArea(value: unknown): value is FoundationFeatureArea {
  return typeof value === "string" && FOUNDATION_FEATURE_AREAS.includes(value as FoundationFeatureArea)
}

export function getFoundationFeatureFlagKey(area: FoundationFeatureArea): string {
  return FOUNDATION_FEATURE_FLAGS[area]
}

export function readBooleanFlagOverride(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function getServerFeatureFallback(area: FoundationFeatureArea): boolean {
  const envKey = `NEXT_PUBLIC_${FOUNDATION_FEATURE_FLAGS[area].toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
  return readBooleanFlagOverride(process.env[envKey], true)
}
