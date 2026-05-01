import {
  aggregateTrackedSpend,
  computeAdaptiveThresholdDays,
  computeBankableSurplus,
  computeGoalProgressPercent,
  computeRawSurplus,
  getWeekRange,
  isCanonicalWeekStart,
  isCapApplied,
  isGoalCompleted,
  isNudgeEligible,
  listPendingWeekRanges,
  parseIsoDateOrNull,
} from "@/lib/budget/calculations"
import { isBudgetTrackingEnabledForProfile } from "@/lib/budget/guards"
import {
  allocateWeeklySurplusTransactional,
  createBudgetGoal,
  getActiveBudgetGoal,
  getBudgetSettings,
  getLatestCompletedGoal,
  getOwnedMediaAsset,
  getOwnedVerificationTask,
  getRecentContributions,
  getRecentSpendLogs,
  getSpendLogsForWeek,
  logBudgetSpend,
  setGoalCompleted,
  switchBudgetGoalTransactional,
  upsertBudgetSettings,
  upsertWeeklySummary,
} from "@/lib/budget/repository"
import type { BudgetGoalCategory, BudgetSpendSource } from "@/lib/budget/types"
import { appendProductEvent } from "@/lib/foundation/product-events-service"
import { buildIdempotencyKey, isDuplicateDatabaseError } from "@/lib/foundation/product-events"

type SupabaseLike = { from: (table: string) => any }

export async function assertBudgetEnabled(supabase: SupabaseLike, profileId: string): Promise<boolean> {
  return isBudgetTrackingEnabledForProfile(supabase, profileId)
}

export async function ensureBudgetSettings(supabase: SupabaseLike, profileId: string, weeklyBudgetCents: number) {
  return upsertBudgetSettings(supabase, profileId, Math.max(0, Math.round(weeklyBudgetCents)))
}

export async function createFirstBudgetGoal(
  supabase: SupabaseLike,
  input: { profileId: string; name: string; category: BudgetGoalCategory; targetCents: number; weeklyBudgetCents: number },
) {
  const activeGoal = await getActiveBudgetGoal(supabase, input.profileId)
  if (activeGoal) {
    return { validationError: "Active goal already exists. Use switch goal to replace it." }
  }

  await ensureBudgetSettings(supabase, input.profileId, input.weeklyBudgetCents)
  const { data, error } = await createBudgetGoal(supabase, {
    profileId: input.profileId,
    name: input.name,
    category: input.category,
    targetCents: input.targetCents,
  })
  if (error) return { error }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "budget.goal_created",
    idempotencyKey: buildIdempotencyKey(["goal-created", input.profileId, data.id]),
    metadata: { goalId: data.id, category: input.category, targetCents: input.targetCents },
  })

  return { goal: data }
}

export async function switchBudgetGoal(
  supabase: SupabaseLike,
  input: { profileId: string; name: string; category: BudgetGoalCategory; targetCents: number; idempotencyKey: string },
) {
  const { data: switchedPayload, error: switchError } = await switchBudgetGoalTransactional(supabase, {
    profileId: input.profileId,
    name: input.name,
    category: input.category,
    targetCents: input.targetCents,
  })
  if (switchError) return { error: switchError }
  if (switchedPayload?.validationError) return { validationError: switchedPayload.validationError as string }

  const goal = switchedPayload?.goal
  const previousGoalId = switchedPayload?.previousGoalId as string | undefined
  if (!goal || !previousGoalId) return { error: new Error("Invalid switch goal payload from RPC.") }

  if (switchedPayload?.completedNow) {
    await appendProductEvent(supabase, input.profileId, {
      eventType: "budget.goal_completed",
      idempotencyKey: buildIdempotencyKey(["budget-goal-completed", input.profileId, goal.id]),
      metadata: { goalId: goal.id, balanceCents: goal.current_balance_cents, targetCents: goal.target_cents },
    })
  } else if (isGoalCompleted(goal.current_balance_cents, goal.target_cents)) {
    const { data: completed, error: completedError } = await setGoalCompleted(supabase, input.profileId, goal.id)
    if (completedError) return { error: completedError }
    Object.assign(goal, completed)
  }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "budget.goal_switched",
    idempotencyKey: input.idempotencyKey,
    metadata: {
      fromGoalId: previousGoalId,
      toGoalId: goal.id,
      transferredBalanceCents: switchedPayload?.transferredBalanceCents ?? 0,
    },
  })

  return { goal, previousGoalId }
}

export async function logBudgetSpendEntry(
  supabase: SupabaseLike,
  input: {
    profileId: string
    amountCents: number
    sourceType: BudgetSpendSource
    occurredAt?: string
    note?: string | null
    mediaAssetId?: string | null
    verificationTaskId?: string | null
    idempotencyKey?: string | null
  },
) {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
  if (Number.isNaN(occurredAt.getTime())) {
    return { validationError: "Invalid occurredAt date." }
  }

  if (input.mediaAssetId) {
    const { data: mediaAsset } = await getOwnedMediaAsset(supabase, input.profileId, input.mediaAssetId)
    if (!mediaAsset) return { validationError: "mediaAssetId does not belong to the authenticated profile." }
  }
  if (input.verificationTaskId) {
    const { data: verificationTask } = await getOwnedVerificationTask(supabase, input.profileId, input.verificationTaskId)
    if (!verificationTask) return { validationError: "verificationTaskId does not belong to the authenticated profile." }
  }
  const weekRange = getWeekRange(occurredAt)
  const { data, error } = await logBudgetSpend(supabase, {
    profileId: input.profileId,
    weekStartDate: weekRange.weekStartDate,
    amountCents: input.amountCents,
    sourceType: input.sourceType,
    note: input.note ?? null,
    mediaAssetId: input.mediaAssetId ?? null,
    verificationTaskId: input.verificationTaskId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  })

  if (isDuplicateDatabaseError(error) && input.idempotencyKey) {
    const { data: existing } = await (supabase as any)
      .from("budget_spend_logs")
      .select("*")
      .eq("profile_id", input.profileId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle()
    if (existing) return { spendLog: existing, duplicate: true }
  }
  if (error) return { error }

  await appendProductEvent(supabase, input.profileId, {
    eventType: "budget.spend_logged",
    idempotencyKey: buildIdempotencyKey(["budget-spend", input.profileId, data.id]),
    metadata: { sourceType: input.sourceType, amountCents: input.amountCents },
  })

  const { data: nudgeState } = await (supabase as any)
    .from("budget_nudge_state")
    .select("*")
    .eq("profile_id", input.profileId)
    .maybeSingle()

  const occurredAtIso = occurredAt.toISOString()
  await (supabase as any)
    .from("budget_nudge_state")
    .upsert(
      {
        profile_id: input.profileId,
        last_contribution_at: occurredAtIso,
      },
      { onConflict: "profile_id" },
    )

  if (nudgeState?.last_nudge_shown_at) {
    const shownAt = new Date(nudgeState.last_nudge_shown_at)
    const recoveryDeadline = new Date(shownAt)
    recoveryDeadline.setDate(recoveryDeadline.getDate() + 7)
    const hasRecoveredAfterShown =
      nudgeState.last_nudge_recovered_at && new Date(nudgeState.last_nudge_recovered_at).getTime() >= shownAt.getTime()

    if (!hasRecoveredAfterShown && occurredAt <= recoveryDeadline) {
      await appendProductEvent(supabase, input.profileId, {
        eventType: "budget.nudge_recovered",
        idempotencyKey: buildIdempotencyKey(["budget-nudge-recovered", input.profileId, shownAt.toISOString()]),
        metadata: { lastNudgeShownAt: nudgeState.last_nudge_shown_at, contributedAt: occurredAtIso },
      })
      await (supabase as any)
        .from("budget_nudge_state")
        .update({ last_nudge_recovered_at: occurredAtIso, pending_recovery_until: null })
        .eq("profile_id", input.profileId)
    }
  }

  return { spendLog: data, duplicate: false }
}

export async function computeWeeklySummaryForWeek(
  supabase: SupabaseLike,
  profileId: string,
  weekStartDate: string,
  options?: { shouldEmitEvent?: boolean },
) {
  const settings = await getBudgetSettings(supabase, profileId)
  if (!settings) {
    return { validationError: "Budget settings are required before computing summaries." }
  }
  if (!isCanonicalWeekStart(weekStartDate, settings.cycleStartDow)) {
    return { validationError: "weekStartDate must be a valid cycle-aligned date." }
  }

  const { weekEndDate } = getWeekRange(`${weekStartDate}T00:00:00.000Z`)
  const { data: spendLogs, error: spendError } = await getSpendLogsForWeek(supabase, profileId, weekStartDate)
  if (spendError) return { error: spendError }

  const mappedLogs = spendLogs.map((log: any) => ({
    amountCents: log.amount_cents as number,
    sourceType: log.source_type as BudgetSpendSource,
  }))
  const aggregated = aggregateTrackedSpend(mappedLogs)
  const rawSurplus = computeRawSurplus(settings.weeklyBudgetCents, aggregated.trackedCents)
  const bankableSurplus = computeBankableSurplus(rawSurplus, settings.weeklyBudgetCents, settings.allocationCapBps)
  const status = bankableSurplus > 0 ? "ready_to_allocate" : "no_surplus"

  const { data: summary, error } = await upsertWeeklySummary(supabase, {
    profileId,
    weekStartDate,
    weekEndDate,
    weeklyBudgetCents: settings.weeklyBudgetCents,
    manualSpendCents: aggregated.manualCents,
    receiptSpendCents: aggregated.receiptCents,
    trackedSpendCents: aggregated.trackedCents,
    rawSurplusCents: rawSurplus,
    bankableSurplusCents: bankableSurplus,
    capApplied: isCapApplied(rawSurplus, bankableSurplus),
    status,
    allocationIdempotencyKey: null,
    allocatedAt: null,
  })
  if (error) return { error }

  if (options?.shouldEmitEvent !== false) {
    await appendProductEvent(supabase, profileId, {
      eventType: "budget.weekly_summary_created",
      idempotencyKey: buildIdempotencyKey(["budget-summary", profileId, weekStartDate]),
      metadata: { weekStartDate, status, bankableSurplusCents: bankableSurplus },
    })
    if (bankableSurplus === 0) {
      await appendProductEvent(supabase, profileId, {
        eventType: "budget.no_surplus_week",
        idempotencyKey: buildIdempotencyKey(["budget-no-surplus", profileId, weekStartDate]),
        metadata: { weekStartDate, trackedSpendCents: aggregated.trackedCents },
      })
    }
  }

  return { summary }
}

export async function computePendingWeeklySummaries(supabase: SupabaseLike, profileId: string) {
  const { data: recentSummary } = await (supabase as any)
    .from("budget_weekly_summaries")
    .select("week_start_date")
    .eq("profile_id", profileId)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  const pending = listPendingWeekRanges(recentSummary?.week_start_date ?? null, new Date())
  const summaries = []
  for (const range of pending) {
    const result = await computeWeeklySummaryForWeek(supabase, profileId, range.weekStartDate, { shouldEmitEvent: true })
    if ("summary" in result && result.summary) {
      summaries.push(result.summary)
    }
  }
  return { summaries }
}

export async function allocateWeeklySurplus(
  supabase: SupabaseLike,
  input: { profileId: string; weekStartDate: string; idempotencyKey: string },
) {
  const parsedWeekStart = parseIsoDateOrNull(input.weekStartDate)
  if (!parsedWeekStart) return { validationError: "weekStartDate must use YYYY-MM-DD format." }

  const { data: allocationPayload, error: allocationError } = await allocateWeeklySurplusTransactional(supabase, {
    profileId: input.profileId,
    weekStartDate: input.weekStartDate,
    idempotencyKey: input.idempotencyKey,
  })
  if (allocationError) return { error: allocationError }
  if (allocationPayload?.validationError) return { validationError: allocationPayload.validationError as string }

  const contribution = allocationPayload?.contribution
  const goal = allocationPayload?.goal
  const summary = allocationPayload?.summary
  const duplicate = Boolean(allocationPayload?.duplicate)
  if (!contribution || !goal) return { error: new Error("Invalid allocation payload from RPC.") }

  if (!duplicate) {
    await appendProductEvent(supabase, input.profileId, {
      eventType: "budget.surplus_allocated",
      idempotencyKey: input.idempotencyKey,
      metadata: {
        weekStartDate: summary?.week_start_date ?? input.weekStartDate,
        amountCents: contribution.amount_cents,
        goalId: goal.id,
      },
    })
  }

  if (allocationPayload?.completedNow) {
    await appendProductEvent(supabase, input.profileId, {
      eventType: "budget.goal_completed",
      idempotencyKey: buildIdempotencyKey(["budget-goal-completed", input.profileId, goal.id]),
      metadata: { goalId: goal.id, balanceCents: goal.current_balance_cents, targetCents: goal.target_cents },
    })
  }

  return { contribution, goal, duplicate }
}

export async function buildBudgetDashboard(supabase: SupabaseLike, profileId: string) {
  const settings = await getBudgetSettings(supabase, profileId)
  const activeGoal = await getActiveBudgetGoal(supabase, profileId)

  const currentWeek = getWeekRange(new Date())
  const summaryResult = await computeWeeklySummaryForWeek(supabase, profileId, currentWeek.weekStartDate, { shouldEmitEvent: false })
  const currentWeekSummary = "summary" in summaryResult ? summaryResult.summary : null

  const { data: recentContributions } = await getRecentContributions(supabase, profileId, 12)
  const { data: recentSpendLogs } = await getRecentSpendLogs(supabase, profileId, 12)
  const { data: latestCompletedGoal } = await getLatestCompletedGoal(supabase, profileId)

  const intervals: number[] = []
  const sorted = (recentContributions ?? []).map((row: any) => new Date(row.contributed_at).getTime()).sort((a: number, b: number) => a - b)
  for (let index = 1; index < sorted.length; index += 1) {
    intervals.push(Math.max(1, Math.round((sorted[index] - sorted[index - 1]) / (1000 * 60 * 60 * 24))))
  }
  const thresholdDays = computeAdaptiveThresholdDays(intervals)
  const lastContributionAt = recentContributions?.[0]?.contributed_at ?? null

  const { data: nudgeState } = await (supabase as any)
    .from("budget_nudge_state")
    .upsert(
      {
        profile_id: profileId,
        current_threshold_days: thresholdDays,
        avg_days_between_contributions: intervals.length > 0 ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
        last_contribution_at: lastContributionAt,
      },
      { onConflict: "profile_id", ignoreDuplicates: false },
    )
    .select("*")
    .single()

  const shouldShowNudge = isNudgeEligible({
    lastContributionAt: nudgeState?.last_contribution_at ?? null,
    currentThresholdDays: nudgeState?.current_threshold_days ?? 21,
    snoozedUntil: nudgeState?.snoozed_until ?? null,
    now: new Date(),
  })

  if (shouldShowNudge) {
    const nudgeShownAt = new Date().toISOString()
    const pendingRecoveryUntil = new Date()
    pendingRecoveryUntil.setDate(pendingRecoveryUntil.getDate() + 7)
    const alreadyShownRecently =
      nudgeState?.last_nudge_shown_at &&
      nudgeState.last_contribution_at &&
      new Date(nudgeState.last_nudge_shown_at).getTime() >= new Date(nudgeState.last_contribution_at).getTime()
    if (!alreadyShownRecently) {
      await (supabase as any)
        .from("budget_nudge_state")
        .update({
          last_nudge_shown_at: nudgeShownAt,
          pending_recovery_until: pendingRecoveryUntil.toISOString(),
        })
        .eq("profile_id", profileId)
      await appendProductEvent(supabase, profileId, {
        eventType: "budget.nudge_shown",
        idempotencyKey: buildIdempotencyKey(["budget-nudge-shown", profileId, currentWeek.weekStartDate]),
        metadata: { thresholdDays },
      })
    }
  }

  const activeGoalView = activeGoal
    ? { ...activeGoal, progressPercent: computeGoalProgressPercent(activeGoal.currentBalanceCents, activeGoal.targetCents) }
    : null
  const sourceBreakdown = currentWeekSummary
    ? {
      manualCents: currentWeekSummary.manual_spend_cents ?? 0,
      receiptCents: currentWeekSummary.receipt_spend_cents ?? 0,
      trackedCents: currentWeekSummary.tracked_spend_cents ?? 0,
    }
    : null
  const completedGoalView = latestCompletedGoal
    ? {
      ...latestCompletedGoal,
      progressPercent: computeGoalProgressPercent(latestCompletedGoal.current_balance_cents, latestCompletedGoal.target_cents),
    }
    : null
  const nudgeView = shouldShowNudge
    ? {
      thresholdDays: nudgeState?.current_threshold_days ?? 21,
      lastContributionAt: nudgeState?.last_contribution_at ?? null,
      snoozedUntil: nudgeState?.snoozed_until ?? null,
    }
    : null

  return {
    featureState: { budgetTrackingEnabled: true },
    settings,
    activeGoal: activeGoalView,
    currentWeek: {
      ...currentWeek,
      summary: currentWeekSummary,
    },
    sourceBreakdown,
    recentSpendLogs: recentSpendLogs ?? [],
    recentContributions: recentContributions ?? [],
    pendingAllocatableWeek: currentWeekSummary?.status === "ready_to_allocate" ? currentWeek : null,
    completedGoal: completedGoalView,
    nudge: nudgeView,
  }
}

export async function dismissBudgetNudge(supabase: SupabaseLike, profileId: string) {
  const now = new Date()
  const snoozedUntil = new Date(now)
  snoozedUntil.setDate(snoozedUntil.getDate() + 14)
  const { data, error } = await (supabase as any)
    .from("budget_nudge_state")
    .upsert(
      {
        profile_id: profileId,
        last_nudge_dismissed_at: now.toISOString(),
        snoozed_until: snoozedUntil.toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single()
  if (error) return { error }

  await appendProductEvent(supabase, profileId, {
    eventType: "budget.nudge_dismissed",
    idempotencyKey: buildIdempotencyKey(["budget-nudge-dismissed", profileId, now.toISOString()]),
    metadata: { snoozedUntil: snoozedUntil.toISOString() },
  })

  return { nudgeState: data }
}
