export const SOCIAL_VISIBILITY_DEFAULTS = ["private", "followers", "public"] as const
export const CONFIRMATION_MODES = [
  "ask_when_uncertain",
  "always_ask",
  "auto_accept_high_confidence",
] as const

export type SocialVisibilityDefault = (typeof SOCIAL_VISIBILITY_DEFAULTS)[number]
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number]

export interface UserFeaturePreferences {
  budgetTrackingEnabled: boolean
  streaksEnabled: boolean
  socialEnabled: boolean
  pantryEnabled: boolean
  socialVisibilityDefault: SocialVisibilityDefault
  autoDraftSocialEnabled: boolean
  showReactionCounts: boolean
  rawMediaRetentionDays: number
  confirmationMode: ConfirmationMode
  pantryAutoDeductEnabled: boolean
  nudgesEnabled: boolean
  hapticsEnabled: boolean
  audioEnabled: boolean
  respectReducedMotion: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
}

export const DEFAULT_USER_FEATURE_PREFERENCES: UserFeaturePreferences = {
  budgetTrackingEnabled: true,
  streaksEnabled: true,
  socialEnabled: false,
  pantryEnabled: true,
  socialVisibilityDefault: "private",
  autoDraftSocialEnabled: false,
  showReactionCounts: true,
  rawMediaRetentionDays: 7,
  confirmationMode: "ask_when_uncertain",
  pantryAutoDeductEnabled: false,
  nudgesEnabled: true,
  hapticsEnabled: true,
  audioEnabled: false,
  respectReducedMotion: true,
  quietHoursStart: null,
  quietHoursEnd: null,
}

export type PreferenceDbUpdate = {
  budget_tracking_enabled?: boolean
  streaks_enabled?: boolean
  social_enabled?: boolean
  pantry_enabled?: boolean
  social_visibility_default?: SocialVisibilityDefault
  auto_draft_social_enabled?: boolean
  show_reaction_counts?: boolean
  raw_media_retention_days?: number
  confirmation_mode?: ConfirmationMode
  pantry_auto_deduct_enabled?: boolean
  nudges_enabled?: boolean
  haptics_enabled?: boolean
  audio_enabled?: boolean
  respect_reduced_motion?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
}

type PreferenceFieldConfig = {
  apiKey: keyof UserFeaturePreferences
  dbKey: keyof PreferenceDbUpdate
  kind: "boolean" | "retention" | "visibility" | "confirmation" | "time"
}

const FIELD_CONFIG: PreferenceFieldConfig[] = [
  { apiKey: "budgetTrackingEnabled", dbKey: "budget_tracking_enabled", kind: "boolean" },
  { apiKey: "streaksEnabled", dbKey: "streaks_enabled", kind: "boolean" },
  { apiKey: "socialEnabled", dbKey: "social_enabled", kind: "boolean" },
  { apiKey: "pantryEnabled", dbKey: "pantry_enabled", kind: "boolean" },
  { apiKey: "socialVisibilityDefault", dbKey: "social_visibility_default", kind: "visibility" },
  { apiKey: "autoDraftSocialEnabled", dbKey: "auto_draft_social_enabled", kind: "boolean" },
  { apiKey: "showReactionCounts", dbKey: "show_reaction_counts", kind: "boolean" },
  { apiKey: "rawMediaRetentionDays", dbKey: "raw_media_retention_days", kind: "retention" },
  { apiKey: "confirmationMode", dbKey: "confirmation_mode", kind: "confirmation" },
  { apiKey: "pantryAutoDeductEnabled", dbKey: "pantry_auto_deduct_enabled", kind: "boolean" },
  { apiKey: "nudgesEnabled", dbKey: "nudges_enabled", kind: "boolean" },
  { apiKey: "hapticsEnabled", dbKey: "haptics_enabled", kind: "boolean" },
  { apiKey: "audioEnabled", dbKey: "audio_enabled", kind: "boolean" },
  { apiKey: "respectReducedMotion", dbKey: "respect_reduced_motion", kind: "boolean" },
  { apiKey: "quietHoursStart", dbKey: "quiet_hours_start", kind: "time" },
  { apiKey: "quietHoursEnd", dbKey: "quiet_hours_end", kind: "time" },
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function readRetentionDays(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(30, Math.max(1, Math.round(parsed)))
}

function readVisibility(value: unknown): SocialVisibilityDefault | undefined {
  return typeof value === "string" && SOCIAL_VISIBILITY_DEFAULTS.includes(value as SocialVisibilityDefault)
    ? (value as SocialVisibilityDefault)
    : undefined
}

function readConfirmationMode(value: unknown): ConfirmationMode | undefined {
  return typeof value === "string" && CONFIRMATION_MODES.includes(value as ConfirmationMode)
    ? (value as ConfirmationMode)
    : undefined
}

function readTime(value: unknown): string | null | undefined {
  if (value === null || value === "") return null
  if (typeof value !== "string") return undefined
  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] === undefined ? 0 : Number(match[3])
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined
  return value
}

function readPreferenceValue(config: PreferenceFieldConfig, value: unknown) {
  switch (config.kind) {
    case "boolean":
      return readBoolean(value)
    case "retention":
      return readRetentionDays(value)
    case "visibility":
      return readVisibility(value)
    case "confirmation":
      return readConfirmationMode(value)
    case "time":
      return readTime(value)
  }
}

export function buildPreferenceDbUpdate(input: unknown): PreferenceDbUpdate {
  if (!isObject(input)) return {}

  return FIELD_CONFIG.reduce<PreferenceDbUpdate>((updates, config) => {
    if (!(config.apiKey in input)) return updates
    const value = readPreferenceValue(config, input[config.apiKey])
    if (value !== undefined) {
      ;(updates as Record<string, unknown>)[config.dbKey] = value
    }
    return updates
  }, {})
}

export function preferenceDbUpdateToApi(update: PreferenceDbUpdate): Partial<UserFeaturePreferences> {
  return FIELD_CONFIG.reduce<Partial<UserFeaturePreferences>>((api, config) => {
    const value = update[config.dbKey]
    if (value !== undefined) {
      ;(api as Record<string, unknown>)[config.apiKey] = value
    }
    return api
  }, {})
}

export function normalizeUserFeaturePreferences(row: Record<string, unknown> | null | undefined): UserFeaturePreferences {
  const result = { ...DEFAULT_USER_FEATURE_PREFERENCES }
  if (!row) return result

  const update = FIELD_CONFIG.reduce<Partial<UserFeaturePreferences>>((api, config) => {
    const value = readPreferenceValue(config, row[config.dbKey])
    if (value !== undefined) {
      ;(api as Record<string, unknown>)[config.apiKey] = value
    }
    return api
  }, {})

  return { ...result, ...update }
}
