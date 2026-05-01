import { assertSafeSocialProjectionPayload } from "@/lib/foundation/privacy"
import {
  COOK_CHECK_REACTIONS,
  SOCIAL_ACTIVITY_TYPES,
  type CookCheckReaction,
  type SocialActivityType,
  type SocialVisibility,
} from "@/lib/social/types"

const MAX_CAPTION_LENGTH = 180

export function isSocialActivityType(value: unknown): value is SocialActivityType {
  return typeof value === "string" && SOCIAL_ACTIVITY_TYPES.includes(value as SocialActivityType)
}

export function isValidSocialVisibility(value: unknown): value is SocialVisibility {
  return value === "private" || value === "followers" || value === "public"
}

export function normalizeCaption(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_CAPTION_LENGTH)
}

export function validateReactionKey(value: unknown): value is CookCheckReaction {
  return typeof value === "string" && COOK_CHECK_REACTIONS.includes(value as CookCheckReaction)
}

export function isCookCheckExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime()
}

export function buildCookCheckProjectionPayload(input: {
  cookCheckId: string
  activityType?: SocialActivityType
  recipeTitle?: string | null
  caption?: string | null
  mediaUrl?: string | null
  milestoneLabel?: string | null
  badgeKey?: string | null
  achievementLabel?: string | null
  amountDisplay?: string | null
  rangeLabel?: string | null
}) {
  const payload = {
    activityType: input.activityType ?? "cook_check",
    cookCheckId: input.cookCheckId,
    recipeTitle: input.recipeTitle ?? null,
    caption: input.caption ?? null,
    mediaUrl: input.mediaUrl ?? null,
    milestoneLabel: input.milestoneLabel ?? null,
    badgeKey: input.badgeKey ?? null,
    achievementLabel: input.achievementLabel ?? null,
    amountDisplay: input.amountDisplay ?? null,
    rangeLabel: input.rangeLabel ?? null,
  }
  assertSafeSocialProjectionPayload(payload)
  return payload
}

export function canViewerSeeVisibility(input: {
  ownerProfileId: string
  viewerProfileId: string
  visibility: SocialVisibility
  viewerFollowsOwner: boolean
}) {
  if (input.ownerProfileId === input.viewerProfileId) return true
  if (input.visibility === "public") return true
  if (input.visibility === "followers") return input.viewerFollowsOwner
  return false
}
