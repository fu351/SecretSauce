export const PRODUCT_EVENT_TYPES = [
  "budget.spend_logged",
  "budget.surplus_banked",
  "budget.goal_switched",
  "budget.nudge_sent",
  "budget.nudge_ignored",
  "budget.nudge_recovered",
  "verification.created",
  "verification.auto_accepted",
  "verification.needs_confirmation",
  "verification.user_confirmed",
  "verification.user_rejected",
  "pantry.item_added",
  "pantry.auto_deducted",
  "pantry.discard_logged",
  "recipe_try.logged",
  "streak.day_credited",
  "streak.freeze_used",
  "social.projection_published",
  "preferences.updated",
] as const

export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number]

export function isProductEventType(value: unknown): value is ProductEventType {
  return typeof value === "string" && PRODUCT_EVENT_TYPES.includes(value as ProductEventType)
}

export function buildIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined && String(part).trim().length > 0)
    .map((part) => String(part).trim().toLowerCase())
    .join(":")
}

export function isDuplicateDatabaseError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505")
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
