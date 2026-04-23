import { SupabaseClient } from "@supabase/supabase-js"
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

type ChallengeRow         = Database["public"]["Tables"]["challenges"]["Row"]
type ChallengeEntryRow    = Database["public"]["Tables"]["challenge_entries"]["Row"]
type ChallengeEntryInsert = Database["public"]["Tables"]["challenge_entries"]["Insert"]
type ChallengeEntryUpdate = Database["public"]["Tables"]["challenge_entries"]["Update"]
type ChallengeVoteRow     = Database["public"]["Tables"]["challenge_votes"]["Row"]
type ChallengeWinnerRow   = Database["public"]["Tables"]["challenge_winners"]["Row"]
type TemplateRow          = Database["public"]["Tables"]["community_challenge_templates"]["Row"]

export type Challenge              = ChallengeRow
export type ChallengeEntry         = ChallengeEntryRow
export type ChallengeVote          = ChallengeVoteRow
export type ChallengeWinner        = ChallengeWinnerRow
export type ChallengeTemplate      = TemplateRow

export type LeaderboardEntry = {
  profile_id:   string
  full_name:    string | null
  avatar_url:   string | null
  username:     string | null
  post_id:      string | null
  like_count:   number
  vote_count:   number
  total_points: number
  is_viewer:    boolean
}

export type ActiveChallenges = {
  star:      (Challenge & { participant_count: number }) | null
  community: (Challenge & { participant_count: number })[]
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

  /** Return all currently active challenges split by type. */
  async getActiveChallenges(): Promise<ActiveChallenges> {
    const now = new Date().toISOString()
    const { data, error } = await this.db
      .from("challenges")
      .select("*")
      .lte("starts_at", now)
      .gte("ends_at", now)
      .order("starts_at", { ascending: false })

    if (error) {
      this.handleError(error, "getActiveChallenges")
      return { star: null, community: [] }
    }

    const rows = data ?? []
    const starRow   = rows.find((c) => c.challenge_type === "star") ?? null
    const community = rows.filter((c) => c.challenge_type === "community")

    const withCounts = async (challenge: Challenge) => ({
      ...challenge,
      participant_count: await this.getParticipantCount(challenge.id),
    })

    const [star, ...communityWithCounts] = await Promise.all([
      starRow ? withCounts(starRow) : Promise.resolve(null),
      ...community.map(withCounts),
    ])

    return { star, community: communityWithCounts }
  }

  /** @deprecated Use getActiveChallenges() */
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
  // VOTES (community challenges)
  // -----------------------------------------------------------------------

  /** Get the viewer's current vote for a challenge, if any. */
  async getViewerVote(
    challengeId: string,
    voterProfileId: string
  ): Promise<ChallengeVote | null> {
    const { data, error } = await this.db
      .from("challenge_votes")
      .select("*")
      .eq("challenge_id", challengeId)
      .eq("voter_profile_id", voterProfileId)
      .maybeSingle()

    if (error) {
      this.handleError(error, `getViewerVote(${challengeId}, ${voterProfileId})`)
      return null
    }
    return data
  }

  /**
   * Cast or change a vote for an entry in a community challenge.
   * Upserts: updates vote target if voter has already voted.
   * Returns null if voter tries to vote for their own entry.
   */
  async castVote(
    challengeId: string,
    voterProfileId: string,
    entryProfileId: string
  ): Promise<ChallengeVote | null> {
    if (voterProfileId === entryProfileId) return null

    const existing = await this.getViewerVote(challengeId, voterProfileId)

    if (existing) {
      if (existing.entry_profile_id === entryProfileId) return existing
      const { data, error } = await this.db
        .from("challenge_votes")
        .update({ entry_profile_id: entryProfileId })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) {
        this.handleError(error, `castVote update(${challengeId})`)
        return null
      }
      return data
    }

    const { data, error } = await this.db
      .from("challenge_votes")
      .insert({ challenge_id: challengeId, voter_profile_id: voterProfileId, entry_profile_id: entryProfileId })
      .select()
      .single()

    if (error) {
      this.handleError(error, `castVote insert(${challengeId})`)
      return null
    }
    return data
  }

  /** Remove the viewer's vote from a challenge. */
  async removeVote(challengeId: string, voterProfileId: string): Promise<boolean> {
    const { error } = await this.db
      .from("challenge_votes")
      .delete()
      .eq("challenge_id", challengeId)
      .eq("voter_profile_id", voterProfileId)

    if (error) {
      this.handleError(error, `removeVote(${challengeId})`)
      return false
    }
    return true
  }

  // -----------------------------------------------------------------------
  // WINNERS (star challenges — service-client only)
  // -----------------------------------------------------------------------

  /** Get winners for a challenge. */
  async getWinners(challengeId: string): Promise<ChallengeWinner[]> {
    const { data, error } = await this.db
      .from("challenge_winners")
      .select("*")
      .eq("challenge_id", challengeId)
      .order("rank", { ascending: true })

    if (error) {
      this.handleError(error, `getWinners(${challengeId})`)
      return []
    }
    return data ?? []
  }

  /**
   * Replace the winner list for a star challenge.
   * profileIds is ordered — index 0 = rank 1.
   * Requires service client.
   */
  async setWinners(challengeId: string, profileIds: string[]): Promise<boolean> {
    const { error: delErr } = await this.db
      .from("challenge_winners")
      .delete()
      .eq("challenge_id", challengeId)

    if (delErr) {
      this.handleError(delErr, `setWinners delete(${challengeId})`)
      return false
    }

    if (profileIds.length === 0) return true

    const rows = profileIds.map((profileId, i) => ({
      challenge_id: challengeId,
      profile_id:   profileId,
      rank:         i + 1,
    }))

    const { error } = await this.db.from("challenge_winners").insert(rows)
    if (error) {
      this.handleError(error, `setWinners insert(${challengeId})`)
      return false
    }
    return true
  }

  // -----------------------------------------------------------------------
  // TEMPLATES
  // -----------------------------------------------------------------------

  async getCommunityTemplates(): Promise<ChallengeTemplate[]> {
    const { data, error } = await this.db
      .from("community_challenge_templates")
      .select("*")
      .order("title", { ascending: true })

    if (error) {
      this.handleError(error, "getCommunityTemplates")
      return []
    }
    return data ?? []
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
      vote_count:   Number(r.vote_count),
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
