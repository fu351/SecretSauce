export type BadgeId =
  | "first_recipe"
  | "recipe_creator_5"
  | "recipe_creator_25"
  | "recipe_creator_100"
  | "social_starter"
  | "popular_chef"
  | "fan_favorite"
  | "challenge_participant"
  | "challenge_winner"
  | "premium_member"
  | "early_adopter"

export interface BadgeDefinition {
  id: BadgeId
  name: string
  description: string
  /** Tailwind text color class for the icon */
  color: string
  /** Emoji fallback icon */
  emoji: string
  /** Higher = more prestigious, affects sort order */
  tier: 1 | 2 | 3
}

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  first_recipe: {
    id: "first_recipe",
    name: "First Recipe",
    description: "Shared your very first recipe",
    color: "text-emerald-500",
    emoji: "🌱",
    tier: 1,
  },
  recipe_creator_5: {
    id: "recipe_creator_5",
    name: "Recipe Builder",
    description: "Created 5 recipes",
    color: "text-green-500",
    emoji: "👨‍🍳",
    tier: 1,
  },
  recipe_creator_25: {
    id: "recipe_creator_25",
    name: "Seasoned Cook",
    description: "Created 25 recipes",
    color: "text-teal-500",
    emoji: "🍳",
    tier: 2,
  },
  recipe_creator_100: {
    id: "recipe_creator_100",
    name: "Master Chef",
    description: "Created 100 recipes",
    color: "text-amber-500",
    emoji: "👑",
    tier: 3,
  },
  social_starter: {
    id: "social_starter",
    name: "Social Starter",
    description: "Earned 5 followers",
    color: "text-blue-500",
    emoji: "🤝",
    tier: 1,
  },
  popular_chef: {
    id: "popular_chef",
    name: "Popular Chef",
    description: "Earned 25 followers",
    color: "text-violet-500",
    emoji: "⭐",
    tier: 2,
  },
  fan_favorite: {
    id: "fan_favorite",
    name: "Fan Favorite",
    description: "Earned 100 followers",
    color: "text-pink-500",
    emoji: "🔥",
    tier: 3,
  },
  challenge_participant: {
    id: "challenge_participant",
    name: "Challenger",
    description: "Participated in a cooking challenge",
    color: "text-orange-500",
    emoji: "🏅",
    tier: 1,
  },
  challenge_winner: {
    id: "challenge_winner",
    name: "Challenge Winner",
    description: "Won a cooking challenge",
    color: "text-yellow-500",
    emoji: "🏆",
    tier: 3,
  },
  premium_member: {
    id: "premium_member",
    name: "Premium Member",
    description: "Upgraded to Secret Sauce Premium",
    color: "text-indigo-500",
    emoji: "💎",
    tier: 2,
  },
  early_adopter: {
    id: "early_adopter",
    name: "Early Adopter",
    description: "Joined Secret Sauce in its early days",
    color: "text-rose-500",
    emoji: "🚀",
    tier: 2,
  },
}

export const ALL_BADGE_IDS = Object.keys(BADGE_DEFINITIONS) as BadgeId[]

export const EARLY_ADOPTER_CUTOFF = "2026-02-01T00:00:00Z"
export const MAX_SHOWCASED_BADGES = 4
