import type { BudgetGoal, BudgetGoalCategory, BudgetSettings, BudgetSpendSource, BudgetWeeklySummary } from "@/lib/budget/types"

type SupabaseLike = {
  from: (table: string) => any
}

export async function getBudgetSettings(supabase: SupabaseLike, profileId: string): Promise<BudgetSettings | null> {
  const { data } = await (supabase as any)
    .from("budget_settings")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle()
  if (!data) return null
  return {
    profileId: data.profile_id,
    weeklyBudgetCents: data.weekly_budget_cents,
    cycleStartDow: data.cycle_start_dow,
    allocationCapBps: data.allocation_cap_bps,
    nudgeBaseDays: data.nudge_base_days,
    nudgeRecoveryWindowDays: data.nudge_recovery_window_days,
    nudgeSnoozeDays: data.nudge_snooze_days,
  }
}

export async function upsertBudgetSettings(supabase: SupabaseLike, profileId: string, weeklyBudgetCents: number) {
  return (supabase as any)
    .from("budget_settings")
    .upsert(
      {
        profile_id: profileId,
        weekly_budget_cents: weeklyBudgetCents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single()
}

export async function getActiveBudgetGoal(supabase: SupabaseLike, profileId: string): Promise<BudgetGoal | null> {
  const { data } = await (supabase as any)
    .from("budget_goals")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    profileId: data.profile_id,
    name: data.name,
    category: data.category,
    targetCents: data.target_cents,
    currentBalanceCents: data.current_balance_cents,
    status: data.status,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    switchedFromGoalId: data.switched_from_goal_id,
  }
}

export async function createBudgetGoal(
  supabase: SupabaseLike,
  input: { profileId: string; name: string; category: BudgetGoalCategory; targetCents: number; balanceCents?: number; switchedFromGoalId?: string | null },
) {
  return (supabase as any)
    .from("budget_goals")
    .insert({
      profile_id: input.profileId,
      name: input.name,
      category: input.category,
      target_cents: input.targetCents,
      current_balance_cents: input.balanceCents ?? 0,
      status: "active",
      switched_from_goal_id: input.switchedFromGoalId ?? null,
    })
    .select("*")
    .single()
}

export async function archiveGoal(supabase: SupabaseLike, profileId: string, goalId: string, status: "paused" | "archived") {
  return (supabase as any)
    .from("budget_goals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("profile_id", profileId)
}

export async function logBudgetSpend(
  supabase: SupabaseLike,
  input: {
    profileId: string
    weekStartDate: string
    amountCents: number
    sourceType: BudgetSpendSource
    note?: string | null
    mediaAssetId?: string | null
    verificationTaskId?: string | null
    idempotencyKey?: string | null
  },
) {
  return (supabase as any)
    .from("budget_spend_logs")
    .insert({
      profile_id: input.profileId,
      week_start_date: input.weekStartDate,
      amount_cents: input.amountCents,
      source_type: input.sourceType,
      note: input.note ?? null,
      media_asset_id: input.mediaAssetId ?? null,
      verification_task_id: input.verificationTaskId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("*")
    .single()
}

export async function getSpendLogsForWeek(supabase: SupabaseLike, profileId: string, weekStartDate: string) {
  const { data, error } = await (supabase as any)
    .from("budget_spend_logs")
    .select("id, amount_cents, source_type, occurred_at")
    .eq("profile_id", profileId)
    .eq("week_start_date", weekStartDate)
  return { data: data ?? [], error }
}

export async function upsertWeeklySummary(
  supabase: SupabaseLike,
  row: Omit<BudgetWeeklySummary, "id" | "allocationIdempotencyKey" | "allocatedAt"> & {
    allocationIdempotencyKey?: string | null
    allocatedAt?: string | null
  },
) {
  return (supabase as any)
    .from("budget_weekly_summaries")
    .upsert(
      {
        profile_id: row.profileId,
        week_start_date: row.weekStartDate,
        week_end_date: row.weekEndDate,
        weekly_budget_cents: row.weeklyBudgetCents,
        manual_spend_cents: row.manualSpendCents,
        receipt_spend_cents: row.receiptSpendCents,
        tracked_spend_cents: row.trackedSpendCents,
        raw_surplus_cents: row.rawSurplusCents,
        bankable_surplus_cents: row.bankableSurplusCents,
        cap_applied: row.capApplied,
        status: row.status,
        allocation_idempotency_key: row.allocationIdempotencyKey ?? null,
        allocated_at: row.allocatedAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,week_start_date" },
    )
    .select("*")
    .single()
}

export async function getWeeklySummary(supabase: SupabaseLike, profileId: string, weekStartDate: string) {
  return (supabase as any)
    .from("budget_weekly_summaries")
    .select("*")
    .eq("profile_id", profileId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle()
}

export async function insertContribution(
  supabase: SupabaseLike,
  input: { profileId: string; goalId: string; weeklySummaryId: string; amountCents: number; idempotencyKey: string },
) {
  return (supabase as any)
    .from("budget_contributions")
    .insert({
      profile_id: input.profileId,
      goal_id: input.goalId,
      weekly_summary_id: input.weeklySummaryId,
      amount_cents: input.amountCents,
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .single()
}

export async function updateGoalBalance(supabase: SupabaseLike, profileId: string, goalId: string, nextBalanceCents: number) {
  return (supabase as any)
    .from("budget_goals")
    .update({
      current_balance_cents: nextBalanceCents,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("profile_id", profileId)
    .select("*")
    .single()
}
