import type { StreakDayStatus } from "@/lib/streaks/types"

type SupabaseLike = {
  from: (table: string) => any
}

export async function getUserStreakState(supabase: SupabaseLike, profileId: string) {
  return (supabase as any).from("user_streaks").select("*").eq("profile_id", profileId).maybeSingle()
}

export async function upsertUserStreakState(
  supabase: SupabaseLike,
  input: {
    profileId: string
    currentCount: number
    longestCount: number
    freezeTokens: number
    graceUsedWeekStart?: string | null
    lastCountedOn?: string | null
    streakStatus?: "active" | "paused" | "archived"
    metadata?: Record<string, unknown>
  },
) {
  return (supabase as any)
    .from("user_streaks")
    .upsert(
      {
        profile_id: input.profileId,
        current_count: input.currentCount,
        longest_count: input.longestCount,
        freeze_tokens: input.freezeTokens,
        grace_used_week_start: input.graceUsedWeekStart ?? null,
        last_counted_on: input.lastCountedOn ?? null,
        streak_status: input.streakStatus ?? "active",
        metadata: input.metadata ?? {},
      },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single()
}

export async function getStreakDay(supabase: SupabaseLike, profileId: string, streakDate: string) {
  return (supabase as any)
    .from("streak_days")
    .select("*")
    .eq("profile_id", profileId)
    .eq("streak_date", streakDate)
    .maybeSingle()
}

export async function upsertStreakDay(
  supabase: SupabaseLike,
  input: {
    profileId: string
    streakDate: string
    status: StreakDayStatus
    sourceRecipeTryId?: string | null
    sourceVerificationTaskId?: string | null
    idempotencyKey?: string | null
    metadata?: Record<string, unknown>
  },
) {
  return (supabase as any)
    .from("streak_days")
    .upsert(
      {
        profile_id: input.profileId,
        streak_date: input.streakDate,
        status: input.status,
        source_recipe_try_id: input.sourceRecipeTryId ?? null,
        source_verification_task_id: input.sourceVerificationTaskId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        metadata: input.metadata ?? {},
      },
      { onConflict: "profile_id,streak_date" },
    )
    .select("*")
    .single()
}

export async function listRecentStreakDays(supabase: SupabaseLike, profileId: string, limit = 30) {
  const { data, error } = await (supabase as any)
    .from("streak_days")
    .select("*")
    .eq("profile_id", profileId)
    .order("streak_date", { ascending: false })
    .limit(limit)
  return { data: data ?? [], error }
}

export async function listStreakMilestones(supabase: SupabaseLike, profileId: string) {
  const { data, error } = await (supabase as any)
    .from("streak_milestones")
    .select("*")
    .eq("profile_id", profileId)
    .order("milestone", { ascending: true })
  return { data: data ?? [], error }
}

export async function insertStreakMilestone(
  supabase: SupabaseLike,
  input: {
    profileId: string
    milestone: number
    reachedOn: string
    streakCount: number
    rewardKey?: string | null
    idempotencyKey?: string | null
  },
) {
  return (supabase as any)
    .from("streak_milestones")
    .insert({
      profile_id: input.profileId,
      milestone: input.milestone,
      reached_on: input.reachedOn,
      streak_count: input.streakCount,
      reward_key: input.rewardKey ?? null,
      source_streak_profile_id: input.profileId,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("*")
    .single()
}

export async function listPendingStreakVerificationTasks(supabase: SupabaseLike, profileId: string) {
  const { data, error } = await (supabase as any)
    .from("verification_tasks")
    .select("id, status, confidence, media_asset_id, created_at, proposed_output")
    .eq("owner_profile_id", profileId)
    .eq("feature_area", "streaks")
    .eq("status", "needs_confirmation")
    .order("created_at", { ascending: false })
  return { data: data ?? [], error }
}
