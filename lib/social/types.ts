export const SOCIAL_ACTIVITY_TYPES = [
  "cook_check",
  "recipe_try",
  "streak_milestone",
  "meal_plan_share",
  "cooking_journey",
  "savings_achievement",
  "pantry_utilization_milestone",
  "badge_earned",
  "competition_win",
  "challenge_result",
  "leaderboard_milestone",
  "campus_cup_result",
] as const

export type SocialActivityType = (typeof SOCIAL_ACTIVITY_TYPES)[number]
export type SocialVisibility = "private" | "followers" | "public"
export type CookCheckStatus = "draft" | "published" | "skipped" | "expired"
export type CookCheckSourceType = "recipe_try" | "streak" | "verification" | "manual_meal"

export const COOK_CHECK_REACTIONS = ["fire", "yum", "clap", "chefkiss"] as const
export type CookCheckReaction = (typeof COOK_CHECK_REACTIONS)[number]

export const COOKING_JOURNEY_TYPES = [
  "cooking_rhythm",
  "meal_prep",
  "budget_friendly",
  "high_protein",
  "recipe_exploration",
  "custom",
] as const

export type CookingJourneyType = (typeof COOKING_JOURNEY_TYPES)[number]
export type CookingJourneyStatus = "active" | "completed" | "archived"
export type JourneyEventType = "recipe_try" | "streak_day" | "meal_plan" | "manual_progress"
export type MealPlanShareStatus = "draft" | "published" | "archived"
