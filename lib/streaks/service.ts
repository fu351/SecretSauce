import { getServerFeatureFallback } from "@/lib/foundation/feature-flags"
import { createRecipeTry } from "@/lib/foundation/recipe-tries"
import { appendProductEvent } from "@/lib/foundation/product-events-service"
import { buildIdempotencyKey } from "@/lib/foundation/product-events"
import { createVerificationTaskWithRouting, applyUserVerificationDecision } from "@/lib/foundation/verification-service"
import {
  calculateCurrentStreak,
  calculateWeeklyCookDialCount,
  canCountMealForDate,
  canUseFreezeToken,
  detectMilestone,
  earnFreezeTokensFromConsistency,
  getLocalStreakDate,
  getWeekStartForGrace,
  shouldArchiveMilestone,
} from "@/lib/streaks/calculations"
import { isStreaksEnabledForProfile } from "@/lib/streaks/guards"
import {
  getStreakDay,
  getUserStreakState,
  insertStreakMilestone,
  listPendingStreakVerificationTasks,
  listRecentStreakDays,
  listStreakMilestones,
  upsertStreakDay,
  upsertUserStreakState,
} from "@/lib/streaks/repository"

type SupabaseLike = { from: (table: string) => any }

export async function assertStreaksEnabled(supabase: SupabaseLike, profileId: string): Promise<boolean> {
  return isStreaksEnabledForProfile(supabase, profileId)
}

async function applyCountedDay(
  supabase: SupabaseLike,
  input: { profileId: string; streakDate: string; sourceRecipeTryId?: string | null; sourceVerificationTaskId?: string | null; idempotencyKey: string; source: "manual" | "verification" },
) {
  const { data: existingDay } = await getStreakDay(supabase, input.profileId, input.streakDate)
  if (!canCountMealForDate(existingDay?.status)) {
    return { alreadyCounted: true as const, streakDay: existingDay }
  }

  const { data: state } = await getUserStreakState(supabase, input.profileId)
  const previousCount = state?.current_count ?? 0
  const adjustedCurrent = calculateCurrentStreak(state?.last_counted_on ?? null, previousCount, input.streakDate)
  const nextCount = adjustedCurrent + 1
  const earnedTokens = earnFreezeTokensFromConsistency(previousCount, nextCount)

  const { data: streakDay, error: dayError } = await upsertStreakDay(supabase, {
    profileId: input.profileId,
    streakDate: input.streakDate,
    status: "counted",
    sourceRecipeTryId: input.sourceRecipeTryId ?? null,
    sourceVerificationTaskId: input.sourceVerificationTaskId ?? null,
    idempotencyKey: input.idempotencyKey,
  })
  if (dayError) return { error: dayError }

  const nextLongest = Math.max(state?.longest_count ?? 0, nextCount)
  const { error: stateError } = await upsertUserStreakState(supabase, {
    profileId: input.profileId,
    currentCount: nextCount,
    longestCount: nextLongest,
    freezeTokens: (state?.freeze_tokens ?? 0) + earnedTokens,
    graceUsedWeekStart: state?.grace_used_week_start ?? null,
    lastCountedOn: input.streakDate,
    streakStatus: "active",
  })
  if (stateError) return { error: stateError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "streak.day_counted",
    idempotencyKey: buildIdempotencyKey(["streak-day-credited", input.profileId, input.streakDate]),
    metadata: { streakDate: input.streakDate, source: input.source, currentCount: nextCount },
  })
  if (earnedTokens > 0) {
    await appendProductEvent(supabase, input.profileId, {
      eventType: "streak.freeze_earned",
      idempotencyKey: buildIdempotencyKey(["streak-freeze-earned", input.profileId, input.streakDate]),
      metadata: { streakDate: input.streakDate, earnedTokens },
    })
  }

  const { data: milestones } = await listStreakMilestones(supabase, input.profileId)
  const existingMilestones = (milestones ?? []).map((row: any) => row.milestone as number)
  if (shouldArchiveMilestone(existingMilestones, nextCount)) {
    const milestone = detectMilestone(nextCount)
    if (milestone) {
      await insertStreakMilestone(supabase, {
        profileId: input.profileId,
        milestone,
        reachedOn: input.streakDate,
        streakCount: nextCount,
        rewardKey: `streak_${milestone}`,
        idempotencyKey: buildIdempotencyKey(["streak-milestone", input.profileId, milestone]),
      })
      await appendProductEvent(supabase, input.profileId, {
        eventType: "streak.milestone_reached",
        idempotencyKey: buildIdempotencyKey(["streak-milestone-reached", input.profileId, milestone]),
        metadata: { milestone, streakCount: nextCount },
      })
      await appendProductEvent(supabase, input.profileId, {
        eventType: "streak.milestone_archived",
        idempotencyKey: buildIdempotencyKey(["streak-milestone-archived", input.profileId, milestone]),
        metadata: { milestone, streakCount: nextCount, rewardKey: `streak_${milestone}` },
      })
    }
  }

  return { alreadyCounted: false as const, streakDay, currentCount: nextCount, earnedTokens }
}

export async function createStreakVerification(
  supabase: SupabaseLike,
  input: {
    profileId: string
    mediaAssetId?: string | null
    idempotencyKey?: string | null
    proposedOutput?: Record<string, unknown>
    occurredOn?: string
    recipeId?: string | null
    confidence?: number | null
  },
) {
  const taskResult = await createVerificationTaskWithRouting(supabase, input.profileId, {
    featureArea: "streaks",
    sourceType: "meal_photo",
    confidence: typeof input.confidence === "number" ? input.confidence : undefined,
    mediaAssetId: input.mediaAssetId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    proposedOutput: input.proposedOutput ?? {},
    confirmationItems: [{ itemType: "meal_confirmation", label: "Confirm this meal counts today." }],
  })
  if ("validationError" in taskResult) return taskResult
  if ("error" in taskResult && taskResult.error) return taskResult

  await appendProductEvent(supabase, input.profileId, {
    eventType: "streak.meal_verification_created",
    idempotencyKey: buildIdempotencyKey(["streak-verification-created", input.profileId, taskResult.verificationTask.id]),
    metadata: { verificationTaskId: taskResult.verificationTask.id, status: taskResult.verificationTask.status },
  })
  await appendProductEvent(supabase, input.profileId, {
    eventType:
      taskResult.verificationTask.status === "auto_accepted"
        ? "streak.verification_auto_accepted"
        : "streak.verification_needs_confirmation",
    idempotencyKey: buildIdempotencyKey(["streak-verification-status", input.profileId, taskResult.verificationTask.id]),
    metadata: { verificationTaskId: taskResult.verificationTask.id, status: taskResult.verificationTask.status },
  })

  if (taskResult.verificationTask.status === "auto_accepted") {
    const streakDate = getLocalStreakDate(input.occurredOn ?? new Date())
    const recipeTryResult = await createRecipeTry(supabase, input.profileId, {
      recipeId: input.recipeId ?? null,
      occurredOn: streakDate,
      status: "succeeded",
      sourceVerificationTaskId: taskResult.verificationTask.id,
      eligibleForStreak: true,
      idempotencyKey: buildIdempotencyKey(["streak-recipe-try-auto", input.profileId, taskResult.verificationTask.id]),
    })
    if ("error" in recipeTryResult && recipeTryResult.error) return recipeTryResult

    const counted = await applyCountedDay(supabase, {
      profileId: input.profileId,
      streakDate,
      sourceRecipeTryId: recipeTryResult.recipeTry.id,
      sourceVerificationTaskId: taskResult.verificationTask.id,
      idempotencyKey: buildIdempotencyKey(["streak-auto-day", input.profileId, taskResult.verificationTask.id]),
      source: "verification",
    })
    if ("error" in counted && counted.error) return counted

    return {
      verificationTask: taskResult.verificationTask,
      duplicate: taskResult.duplicate,
      autoAccepted: true as const,
      streakCredited: !counted.alreadyCounted,
    }
  }

  return {
    verificationTask: taskResult.verificationTask,
    duplicate: taskResult.duplicate,
    autoAccepted: false as const,
    streakCredited: false as const,
  }
}

export async function confirmStreakVerification(
  supabase: SupabaseLike,
  input: { profileId: string; verificationTaskId: string; idempotencyKey?: string | null; recipeId?: string | null; occurredOn?: string },
) {
  const decisionResult = await applyUserVerificationDecision(
    supabase,
    input.profileId,
    input.verificationTaskId,
    "confirm",
    { eligibleForStreak: true },
  )
  if ("validationError" in decisionResult) return decisionResult
  if ("error" in decisionResult && decisionResult.error) return decisionResult

  await appendProductEvent(supabase, input.profileId, {
    eventType: "streak.verification_user_confirmed",
    idempotencyKey: buildIdempotencyKey(["streak-verification-confirmed", input.profileId, input.verificationTaskId]),
    metadata: { verificationTaskId: input.verificationTaskId },
  })

  const streakDate = getLocalStreakDate(input.occurredOn ?? new Date())
  const recipeTryResult = await createRecipeTry(supabase, input.profileId, {
    recipeId: input.recipeId ?? null,
    occurredOn: streakDate,
    status: "succeeded",
    sourceVerificationTaskId: input.verificationTaskId,
    eligibleForStreak: true,
    idempotencyKey: buildIdempotencyKey(["streak-recipe-try", input.profileId, input.verificationTaskId]),
  })
  if ("error" in recipeTryResult && recipeTryResult.error) return recipeTryResult

  await appendProductEvent(supabase, input.profileId, {
    eventType: "recipe.try_logged",
    idempotencyKey: buildIdempotencyKey(["streak-recipe-try-logged", input.profileId, recipeTryResult.recipeTry.id]),
    metadata: { recipeTryId: recipeTryResult.recipeTry.id, sourceVerificationTaskId: input.verificationTaskId },
  })

  return applyCountedDay(supabase, {
    profileId: input.profileId,
    streakDate,
    sourceRecipeTryId: recipeTryResult.recipeTry.id,
    sourceVerificationTaskId: input.verificationTaskId,
    idempotencyKey: input.idempotencyKey ?? buildIdempotencyKey(["streak-day", input.profileId, streakDate]),
    source: "verification",
  })
}

export async function manualConfirmMeal(
  supabase: SupabaseLike,
  input: { profileId: string; occurredOn?: string; recipeId?: string | null; idempotencyKey?: string | null },
) {
  const streakDate = getLocalStreakDate(input.occurredOn ?? new Date())
  const recipeTryResult = await createRecipeTry(supabase, input.profileId, {
    recipeId: input.recipeId ?? null,
    occurredOn: streakDate,
    status: "attempted",
    eligibleForStreak: true,
    idempotencyKey: buildIdempotencyKey(["streak-manual-try", input.profileId, streakDate]),
  })
  if ("error" in recipeTryResult && recipeTryResult.error) return recipeTryResult

  await appendProductEvent(supabase, input.profileId, {
    eventType: "streak.manual_meal_confirmed",
    idempotencyKey: buildIdempotencyKey(["streak-manual-confirmed", input.profileId, streakDate]),
    metadata: { sourceType: "manual" },
  })

  return applyCountedDay(supabase, {
    profileId: input.profileId,
    streakDate,
    sourceRecipeTryId: recipeTryResult.recipeTry.id,
    idempotencyKey: input.idempotencyKey ?? buildIdempotencyKey(["streak-manual-day", input.profileId, streakDate]),
    source: "manual",
  })
}

export async function applyGraceSkip(
  supabase: SupabaseLike,
  input: { profileId: string; streakDate: string; idempotencyKey?: string | null },
) {
  const { data: state } = await getUserStreakState(supabase, input.profileId)
  const weekStart = getWeekStartForGrace(input.streakDate)
  if (state?.grace_used_week_start === weekStart) {
    return { validationError: "Grace skip already used this week." }
  }

  const { data: day } = await getStreakDay(supabase, input.profileId, input.streakDate)
  if (day?.status === "counted") return { validationError: "This day is already counted." }

  const { error: dayError } = await upsertStreakDay(supabase, {
    profileId: input.profileId,
    streakDate: input.streakDate,
    status: "grace",
    idempotencyKey: input.idempotencyKey ?? buildIdempotencyKey(["streak-grace", input.profileId, input.streakDate]),
    metadata: { message: "Rhythm paused. Pick up tomorrow." },
  })
  if (dayError) return { error: dayError }

  const { error: stateError } = await upsertUserStreakState(supabase, {
    profileId: input.profileId,
    currentCount: state?.current_count ?? 0,
    longestCount: state?.longest_count ?? 0,
    freezeTokens: state?.freeze_tokens ?? 0,
    graceUsedWeekStart: weekStart,
    lastCountedOn: state?.last_counted_on ?? null,
  })
  if (stateError) return { error: stateError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "streak.grace_applied",
    idempotencyKey: buildIdempotencyKey(["streak-grace-applied", input.profileId, input.streakDate]),
    metadata: { streakDate: input.streakDate, message: "Rhythm paused. Pick up tomorrow." },
  })

  return { applied: true }
}

export async function useFreezeToken(
  supabase: SupabaseLike,
  input: { profileId: string; streakDate: string; idempotencyKey?: string | null },
) {
  const { data: state } = await getUserStreakState(supabase, input.profileId)
  const freezeTokens = state?.freeze_tokens ?? 0
  if (!canUseFreezeToken(freezeTokens)) {
    return { validationError: "No freeze tokens available." }
  }

  const { error: dayError } = await upsertStreakDay(supabase, {
    profileId: input.profileId,
    streakDate: input.streakDate,
    status: "frozen",
    idempotencyKey: input.idempotencyKey ?? buildIdempotencyKey(["streak-freeze", input.profileId, input.streakDate]),
    metadata: { message: "Freeze applied" },
  })
  if (dayError) return { error: dayError }

  const { error: stateError } = await upsertUserStreakState(supabase, {
    profileId: input.profileId,
    currentCount: state?.current_count ?? 0,
    longestCount: state?.longest_count ?? 0,
    freezeTokens: freezeTokens - 1,
    graceUsedWeekStart: state?.grace_used_week_start ?? null,
    lastCountedOn: state?.last_counted_on ?? null,
    streakStatus: "paused",
  })
  if (stateError) return { error: stateError }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "streak.freeze_used",
    idempotencyKey: buildIdempotencyKey(["streak-freeze-used", input.profileId, input.streakDate]),
    metadata: { streakDate: input.streakDate },
  })

  return { applied: true }
}

export async function buildStreakDashboard(supabase: SupabaseLike, profileId: string) {
  const enabled = await isStreaksEnabledForProfile(supabase, profileId)
  if (!enabled) {
    return {
      featureState: { streaksEnabled: false },
      currentCount: 0,
      longestCount: 0,
      freezeTokens: 0,
      weeklyCookDialCount: 0,
      recentDays: [],
      pendingConfirmations: [],
      milestones: [],
      pendingState: null,
    }
  }

  const { data: state } = await getUserStreakState(supabase, profileId)
  const { data: recentDays } = await listRecentStreakDays(supabase, profileId, 14)
  const { data: pendingConfirmations } = await listPendingStreakVerificationTasks(supabase, profileId)
  const { data: milestones } = await listStreakMilestones(supabase, profileId)
  const countedDates = (recentDays ?? [])
    .filter((row: any) => row.status === "counted")
    .map((row: any) => row.streak_date as string)

  return {
    featureState: { streaksEnabled: true },
    currentCount: state?.current_count ?? 0,
    longestCount: state?.longest_count ?? 0,
    freezeTokens: state?.freeze_tokens ?? 0,
    weeklyCookDialCount: calculateWeeklyCookDialCount(countedDates, new Date()),
    recentDays: recentDays ?? [],
    pendingConfirmations: pendingConfirmations ?? [],
    milestones: milestones ?? [],
    pendingState: pendingConfirmations && pendingConfirmations.length > 0 ? "needs_confirmation" : null,
    photoVerificationEnabled: getServerFeatureFallback("photo_verification"),
  }
}
