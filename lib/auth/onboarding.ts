const VALID_GOALS = new Set(["cooking", "budgeting", "health"])
const VALID_COOKING_LEVELS = new Set(["beginner", "intermediate", "advanced"])
const VALID_BUDGET_RANGES = new Set(["low", "medium", "high"])
const VALID_COOKING_TIMES = new Set(["quick", "medium", "long", "any"])
const VALID_THEMES = new Set(["light", "dark"])

type OnboardingProfile = {
  primary_goal?: unknown
  cooking_level?: unknown
  budget_range?: unknown
  cooking_time_preference?: unknown
  formatted_address?: unknown
  zip_code?: unknown
  city?: unknown
  theme_preference?: unknown
} | null | undefined

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function isProfileOnboardingComplete(profile: OnboardingProfile): boolean {
  if (!profile) return false

  const hasLocation =
    hasText(profile.formatted_address) ||
    hasText(profile.zip_code) ||
    hasText(profile.city)

  return (
    hasText(profile.primary_goal) &&
    VALID_GOALS.has(profile.primary_goal) &&
    hasText(profile.cooking_level) &&
    VALID_COOKING_LEVELS.has(profile.cooking_level) &&
    hasText(profile.budget_range) &&
    VALID_BUDGET_RANGES.has(profile.budget_range) &&
    hasText(profile.cooking_time_preference) &&
    VALID_COOKING_TIMES.has(profile.cooking_time_preference) &&
    hasLocation &&
    hasText(profile.theme_preference) &&
    VALID_THEMES.has(profile.theme_preference)
  )
}
