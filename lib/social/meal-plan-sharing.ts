import { assertSafeSocialProjectionPayload } from "@/lib/foundation/privacy"
import {
  COOKING_JOURNEY_TYPES,
  type CookingJourneyType,
  type SocialVisibility,
} from "@/lib/social/types"
import { isValidSocialVisibility } from "@/lib/social/helpers"

export type MealPlanShareSlot = {
  dayOffset: number
  date: string
  mealType: string
  recipeId: string
  recipeTitle: string
  tags: string[]
  protein?: string | null
}

export type SanitizedMealPlanShare = {
  title: string
  summaryLine: string
  weekIndex: number
  mealCount: number
  recipeCount: number
  recipeTitles: string[]
  tags: string[]
  slots: MealPlanShareSlot[]
  accomplishmentLabels: string[]
  estimatedTotalLabel?: string | null
}

const MAX_TITLE_LENGTH = 80
const MAX_TAGS = 8
const MAX_RECIPES_IN_PROJECTION = 6

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback
  return value.trim().replace(/\s+/g, " ")
}

function cleanTitle(value: unknown, fallback: string): string {
  return (cleanText(value, fallback) || fallback).slice(0, MAX_TITLE_LENGTH)
}

function cleanTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((value) => cleanText(value).toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS)
}

export function validateMealPlanShareVisibility(value: unknown): value is SocialVisibility {
  return isValidSocialVisibility(value)
}

export function validateJourneyType(value: unknown): value is CookingJourneyType {
  return typeof value === "string" && COOKING_JOURNEY_TYPES.includes(value as CookingJourneyType)
}

export function sanitizeMealPlanForShare(input: {
  title?: unknown
  weekIndex: number
  meals: Array<{
    date: string
    meal_type: string
    recipe_id: string
    recipe?: {
      id?: string
      title?: string | null
      tags?: unknown
      protein?: string | null
      meal_type?: string | null
    } | null
  }>
  estimatedTotalLabel?: unknown
  accomplishmentLabels?: unknown
}): SanitizedMealPlanShare {
  const sortedMeals = [...input.meals].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.meal_type.localeCompare(b.meal_type)
  })
  const firstDate = sortedMeals[0]?.date ? new Date(`${sortedMeals[0].date}T00:00:00`) : null
  const slots = sortedMeals
    .map((meal) => {
      const recipeTitle = cleanTitle(meal.recipe?.title, "Recipe")
      const date = cleanText(meal.date)
      const dayOffset = firstDate && date
        ? Math.max(0, Math.round((new Date(`${date}T00:00:00`).getTime() - firstDate.getTime()) / 86_400_000))
        : 0
      return {
        dayOffset,
        date,
        mealType: cleanText(meal.meal_type, "meal"),
        recipeId: cleanText(meal.recipe?.id ?? meal.recipe_id),
        recipeTitle,
        tags: cleanTags(meal.recipe?.tags),
        protein: cleanText(meal.recipe?.protein) || null,
      }
    })
    .filter((slot) => slot.recipeId && slot.recipeTitle)

  const recipeTitles = [...new Set(slots.map((slot) => slot.recipeTitle))]
  const tags = [...new Set(slots.flatMap((slot) => [...slot.tags, slot.protein].filter(Boolean) as string[]))].slice(0, MAX_TAGS)
  const title = cleanTitle(input.title, `${slots.length || 0}-Meal Plan`)
  const accomplishmentLabels = cleanTags(input.accomplishmentLabels).map((tag) => tag.replace(/-/g, " "))
  const estimatedTotalLabel = cleanText(input.estimatedTotalLabel) || null

  const sanitized: SanitizedMealPlanShare = {
    title,
    summaryLine: `${slots.length} meal${slots.length === 1 ? "" : "s"} planned`,
    weekIndex: input.weekIndex,
    mealCount: slots.length,
    recipeCount: recipeTitles.length,
    recipeTitles,
    tags,
    slots,
    accomplishmentLabels,
    estimatedTotalLabel,
  }
  assertSafeSocialProjectionPayload(sanitized)
  return sanitized
}

export function buildMealPlanShareProjectionPayload(input: {
  shareId: string
  summary: SanitizedMealPlanShare
}) {
  const payload = {
    activityType: "meal_plan_share",
    shareId: input.shareId,
    title: input.summary.title,
    summaryLine: input.summary.summaryLine,
    mealCount: input.summary.mealCount,
    recipeCount: input.summary.recipeCount,
    recipeTitles: input.summary.recipeTitles.slice(0, MAX_RECIPES_IN_PROJECTION),
    tags: input.summary.tags,
    accomplishmentLabels: input.summary.accomplishmentLabels,
    estimatedTotalLabel: input.summary.estimatedTotalLabel ?? null,
  }
  assertSafeSocialProjectionPayload(payload)
  return payload
}

export function canViewMealPlanShare(input: {
  ownerProfileId: string
  viewerProfileId: string
  visibility: SocialVisibility
  status: string
  viewerFollowsOwner: boolean
}) {
  if (input.ownerProfileId === input.viewerProfileId) return true
  if (input.status !== "published") return false
  if (input.visibility === "public") return true
  if (input.visibility === "followers") return input.viewerFollowsOwner
  return false
}

export function canRemixMealPlan(input: {
  ownerProfileId: string
  viewerProfileId: string
  visibility: SocialVisibility
  status: string
  viewerFollowsOwner: boolean
}) {
  return canViewMealPlanShare(input) && input.status === "published"
}

export function calculateJourneyProgress(input: { currentProgress?: number | null; targetCount: number; delta?: number | null }) {
  const targetCount = Math.max(1, Math.floor(Number(input.targetCount) || 1))
  const current = Math.max(0, Math.floor(Number(input.currentProgress) || 0))
  const delta = Math.max(0, Math.floor(Number(input.delta) || 0))
  const currentProgress = Math.min(targetCount, current + delta)
  return {
    currentProgress,
    targetCount,
    percentComplete: Math.round((currentProgress / targetCount) * 100),
    completed: currentProgress >= targetCount,
  }
}

export function detectJourneyCompletion(input: { currentProgress: number; targetCount: number }) {
  return calculateJourneyProgress({ currentProgress: input.currentProgress, targetCount: input.targetCount }).completed
}

export function sanitizeJourneyProjectionPayload(input: {
  journeyId: string
  title: string
  journeyType: CookingJourneyType
  currentProgress: number
  targetCount: number
}) {
  const progress = calculateJourneyProgress({
    currentProgress: input.currentProgress,
    targetCount: input.targetCount,
  })
  const payload = {
    activityType: "cooking_journey",
    journeyId: input.journeyId,
    title: cleanTitle(input.title, "Cooking journey"),
    journeyType: input.journeyType,
    progressLabel: `${progress.currentProgress}/${progress.targetCount}`,
    currentProgress: progress.currentProgress,
    targetCount: progress.targetCount,
    percentComplete: progress.percentComplete,
    achievementLabel: "Journey completed",
  }
  assertSafeSocialProjectionPayload(payload)
  return payload
}
