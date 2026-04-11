import { SupabaseClient } from "@supabase/supabase-js"
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

type ChallengeRow       = Database["public"]["Tables"]["challenges"]["Row"]
type ChallengeEntryRow  = Database["public"]["Tables"]["challenge_entries"]["Row"]
type ChallengeEntryInsert = Database["public"]["Tables"]["challenge_entries"]["Insert"]
type ChallengeEntryUpdate = Database["public"]["Tables"]["challenge_entries"]["Update"]

export type Challenge      = ChallengeRow
export type ChallengeEntry = ChallengeEntryRow

export type LeaderboardEntry = {
  profile_id:   string
  full_name:    string | null
  avatar_url:   string | null
  username:     string | null
  post_id:      string | null
  like_count:   number
  total_points: number
  is_viewer:    boolean
}

class ChallengeTable extends BaseTable<
  "challenge_entries",
  ChallengeEntryRow,
  ChallengeEntryInsert,
  ChallengeEntryUpdate
> {
  private static instance: ChallengeTable | null = null
  readonly tableName = "challenge_entries" as const

  private serviceClient: SupabaseClient<Database> | null = null

  private constructor() { super() }

  static getInstance(): ChallengeTable {
    if (!ChallengeTable.instance) {
      ChallengeTable.instance = new ChallengeTable()
    }
    return ChallengeTable.instance
  }

  private get db(): SupabaseClient<Database> {
    return (this.serviceClient ?? this.supabase) as SupabaseClient<Database>
  }

  withServiceClient(client: SupabaseClient<Database>): this {
    this.serviceClient = client
    return this
  }

  // -----------------------------------------------------------------------
  // CHALLENGES
  // -----------------------------------------------------------------------

  /** Return the currently active challenge (now() is between starts_at and ends_at). */
  async getActiveChallenge(): Promise<Challenge | null> {
    const now = new Date().toISOString()
    const { data, error } = await this.db
      .from("challenges")
      .select("*")
      .lte("starts_at", now)
      .gte("ends_at", now)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      this.handleError(error, "getActiveChallenge")
      return null
    }
    return data
  }

  /** Count how many profiles have joined a challenge. */
  async getParticipantCount(challengeId: string): Promise<number> {
    const { count, error } = await this.db
      .from("challenge_entries")
      .select("id", { count: "exact", head: true })
      .eq("challenge_id", challengeId)

    if (error) {
      this.handleError(error, `getParticipantCount(${challengeId})`)
      return 0
    }
    return count ?? 0
  }

  // -----------------------------------------------------------------------
  // ENTRIES
  // -----------------------------------------------------------------------

  /** Get a profile's entry for a challenge, or null if they haven't joined. */
  async getEntry(
    challengeId: string,
    profileId: string
  ): Promise<ChallengeEntry | null> {
    const { data, error } = await this.db
      .from("challenge_entries")
      .select("*")
      .eq("challenge_id", challengeId)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (error) {
      this.handleError(error, `getEntry(${challengeId}, ${profileId})`)
      return null
    }
    return data
  }

  /**
   * Join a challenge (or update an existing entry with a post).
   * Upserts so repeat calls are idempotent.
   */
  async joinChallenge(
    challengeId: string,
    profileId: string,
    postId?: string | null
  ): Promise<ChallengeEntry | null> {
    const payload: ChallengeEntryInsert = {
      challenge_id: challengeId,
      profile_id:   profileId,
      ...(postId != null ? { post_id: postId } : {}),
    }

    const { data: existing } = await this.db
      .from("challenge_entries")
      .select("id, post_id")
      .eq("challenge_id", challengeId)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (existing) {
      // Only update post_id if a new one is being provided
      if (postId != null && existing.post_id !== postId) {
        const { data, error } = await this.db
          .from("challenge_entries")
          .update({ post_id: postId })
          .eq("id", existing.id)
          .select()
          .single()

        if (error) {
          this.handleError(error, `joinChallenge update(${challengeId})`)
          return null
        }
        return data
      }
      // Nothing changed — return existing (re-fetch full row)
      return this.getEntry(challengeId, profileId)
    }

    const { data, error } = await this.db
      .from("challenge_entries")
      .insert(payload)
      .select()
      .single()

    if (error) {
      this.handleError(error, `joinChallenge insert(${challengeId})`)
      return null
    }
    return data
  }

  // -----------------------------------------------------------------------
  // LEADERBOARD
  // -----------------------------------------------------------------------

  /** Get ranked leaderboard via SQL function. */
  async getLeaderboard(
    challengeId: string,
    viewerProfileId: string | null = null,
    scope: "global" | "friends" = "global",
    limit = 10
  ): Promise<LeaderboardEntry[]> {
    const { data, error } = await (this.db as any).rpc(
      "fn_challenge_leaderboard",
      {
        p_challenge_id: challengeId,
        p_viewer_id:    viewerProfileId,
        p_scope:        scope,
        p_limit:        limit,
      }
    )

    if (error) {
      this.handleError(error, `getLeaderboard(${challengeId})`)
      return []
    }

    return (data ?? []).map((r: any) => ({
      profile_id:   r.profile_id,
      full_name:    r.full_name,
      avatar_url:   r.avatar_url,
      username:     r.username,
      post_id:      r.post_id,
      like_count:   Number(r.like_count),
      total_points: Number(r.total_points),
      is_viewer:    r.is_viewer,
    }))
  }

  /** Get the viewer's rank (1-based). */
  async getViewerRank(
    challengeId: string,
    viewerProfileId: string,
    scope: "global" | "friends" = "global"
  ): Promise<number | null> {
    const { data, error } = await (this.db as any).rpc(
      "fn_challenge_viewer_rank",
      {
        p_challenge_id: challengeId,
        p_viewer_id:    viewerProfileId,
        p_scope:        scope,
      }
    )

    if (error) {
      this.handleError(error, `getViewerRank(${challengeId})`)
      return null
    }
    return typeof data === "number" ? data : null
  }
}

export const challengeDB = ChallengeTable.getInstance()
