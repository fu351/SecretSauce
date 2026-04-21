import { readBoolean, readBoundedFloat, readPositiveInt } from "../env-utils"

export interface MABReallocationConfig {
  posthogApiKey: string
  posthogProjectId: string
  posthogHost: string
  experimentIds: string[]
  minExposures: number
  minFloorPct: number
  dryRun: boolean
}

export function requirePosthogEnv(): void {
  if (!process.env.POSTHOG_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
    throw new Error(
      "Missing PostHog credentials. Set POSTHOG_API_KEY and POSTHOG_PROJECT_ID."
    )
  }
}

export function getMABReallocationConfigFromEnv(
  overrides?: Partial<MABReallocationConfig>
): MABReallocationConfig {
  const rawIds = process.env.MAB_EXPERIMENT_IDS ?? ""
  const experimentIds = rawIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    posthogApiKey: process.env.POSTHOG_API_KEY ?? "",
    posthogProjectId: process.env.POSTHOG_PROJECT_ID ?? "",
    posthogHost: process.env.POSTHOG_HOST?.trim() || "https://us.posthog.com",
    experimentIds,
    minExposures: readPositiveInt(process.env.MAB_MIN_EXPOSURES, 50),
    minFloorPct: readBoundedFloat(process.env.MAB_MIN_FLOOR_PCT, 5, 0, 50),
    dryRun: readBoolean(process.env.MAB_DRY_RUN, false),
    ...overrides,
  }
}
