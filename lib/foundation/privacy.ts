export const DISALLOWED_SOCIAL_PROJECTION_KEYS = [
  "budget",
  "budgetAmount",
  "budget_amount",
  "deficit",
  "jarBalance",
  "jar_balance",
  "savingsGoal",
  "savings_goal",
  "aiConfidence",
  "ai_confidence",
  "confidence",
  "stagnation",
  "nudgeState",
  "nudge_state",
  "pantryInventory",
  "pantry_inventory",
  "receiptTotal",
  "receipt_total",
] as const

export const SOCIAL_PROJECTION_EVENT_TYPES = [
  "cook_check.approved",
  "recipe_try.logged",
  "streak_milestone.reached",
  "meal_plan_share.published",
  "cooking_journey.published",
  "savings_achievement.reached",
  "pantry_utilization_milestone.reached",
  "badge_earned.published",
  "competition_win.published",
  "challenge_result.published",
  "leaderboard_milestone.reached",
  "campus_cup_result.published",
] as const

export type SocialProjectionEventType = (typeof SOCIAL_PROJECTION_EVENT_TYPES)[number]

function findDisallowedKeys(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return []

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDisallowedKeys(item, `${path}[${index}]`))
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const currentPath = `${path}.${key}`
    const matches = DISALLOWED_SOCIAL_PROJECTION_KEYS.includes(
      key as (typeof DISALLOWED_SOCIAL_PROJECTION_KEYS)[number],
    )
      ? [currentPath]
      : []
    return [...matches, ...findDisallowedKeys(nested, currentPath)]
  })
}

export function getSocialProjectionPrivacyViolations(payload: unknown): string[] {
  return findDisallowedKeys(payload)
}

export function assertSafeSocialProjectionPayload(payload: unknown): void {
  const violations = getSocialProjectionPrivacyViolations(payload)
  if (violations.length > 0) {
    throw new Error(`Social projection payload contains private fields: ${violations.join(", ")}`)
  }
}

export function isSocialProjectionEventType(value: unknown): value is SocialProjectionEventType {
  return typeof value === "string" && SOCIAL_PROJECTION_EVENT_TYPES.includes(value as SocialProjectionEventType)
}
