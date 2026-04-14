import { SupabaseClient } from "@supabase/supabase-js"
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

type FollowRequestRow    = Database["public"]["Tables"]["follow_requests"]["Row"]
type FollowRequestInsert = Database["public"]["Tables"]["follow_requests"]["Insert"]
type FollowRequestUpdate = Database["public"]["Tables"]["follow_requests"]["Update"]
type FollowStatus        = Database["public"]["Enums"]["follow_request_status"]

export type FollowRequest = FollowRequestRow

export type FollowStatusResult =
  | { status: FollowStatus; requestId: string }
  | { status: "none" }

export type ProfileSummary = {
  id: string
  full_name: string | null
  avatar_url: string | null
  is_private: boolean
}

class FollowTable extends BaseTable<
  "follow_requests",
  FollowRequestRow,
  FollowRequestInsert,
  FollowRequestUpdate
> {
  private static instance: FollowTable | null = null
  readonly tableName = "follow_requests" as const

  private serviceClient: SupabaseClient<Database> | null = null

  private constructor() {
    super()
  }

  static getInstance(): FollowTable {
    if (!FollowTable.instance) {
      FollowTable.instance = new FollowTable()
    }
    return FollowTable.instance
  }

  private get db(): SupabaseClient<Database> {
    return (this.serviceClient ?? this.supabase) as SupabaseClient<Database>
  }

  /**
   * Bind a service-role client for server-side API routes.
   * Returns `this` for call-chaining.
   */
  withServiceClient(client: SupabaseClient<Database>): this {
    this.serviceClient = client
    return this
  }

  // -----------------------------------------------------------------------
  // WRITES
  // -----------------------------------------------------------------------

  /**
   * Send a follow request. For public accounts, immediately sets status to
   * 'accepted'. For private accounts, sets status to 'pending'.
   * Upserts to make repeat calls idempotent.
   */
  async sendFollowRequest(
    followerId: string,
    followingId: string
  ): Promise<FollowRequestRow | null> {
    const { data: target, error: profileError } = await this.db
      .from("profiles")
      .select("is_private")
      .eq("id", followingId)
      .single()

    if (profileError || !target) {
      this.handleError(profileError, `sendFollowRequest — fetch target profile(${followingId})`)
      return null
    }

    const status: FollowStatus = target.is_private ? "pending" : "accepted"

    const { data, error } = await this.db
      .from("follow_requests")
      .upsert(
        { follower_id: followerId, following_id: followingId, status },
        { onConflict: "follower_id,following_id" }
      )
      .select()
      .single()

    if (error) {
      this.handleError(error, `sendFollowRequest(${followerId} -> ${followingId})`)
      return null
    }
    return data
  }

  /**
   * Unfollow or cancel a pending request.
   */
  async cancelFollow(followerId: string, followingId: string): Promise<boolean> {
    const { error } = await this.db
      .from("follow_requests")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId)

    if (error) {
      this.handleError(error, `cancelFollow(${followerId} -> ${followingId})`)
      return false
    }
    return true
  }

  /**
   * Accept a pending follow request. Only the target (following_id) may call this.
   */
  async acceptRequest(requestId: string, followingId: string): Promise<FollowRequestRow | null> {
    const { data, error } = await this.db
      .from("follow_requests")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("following_id", followingId)
      .eq("status", "pending")
      .select()
      .single()

    if (error) {
      this.handleError(error, `acceptRequest(${requestId})`)
      return null
    }
    return data
  }

  /**
   * Reject a pending follow request. Only the target (following_id) may call this.
   */
  async rejectRequest(requestId: string, followingId: string): Promise<FollowRequestRow | null> {
    const { data, error } = await this.db
      .from("follow_requests")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("following_id", followingId)
      .eq("status", "pending")
      .select()
      .single()

    if (error) {
      this.handleError(error, `rejectRequest(${requestId})`)
      return null
    }
    return data
  }

  // -----------------------------------------------------------------------
  // READS
  // -----------------------------------------------------------------------

  /**
   * Get the follow relationship status between two users.
   */
  async getFollowStatus(
    followerId: string,
    followingId: string
  ): Promise<FollowStatusResult> {
    const { data, error } = await this.db
      .from("follow_requests")
      .select("id, status")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle()

    if (error) {
      this.handleError(error, `getFollowStatus(${followerId} -> ${followingId})`)
      return { status: "none" }
    }
    if (!data) return { status: "none" }
    return { status: data.status, requestId: data.id }
  }

  /**
   * Get accepted followers of a profile with basic profile info.
   */
  async getFollowers(
    profileId: string,
    limit = 50,
    offset = 0
  ): Promise<ProfileSummary[]> {
    const { data, error } = await this.db
      .from("follow_requests")
      .select(`
        follower_id,
        profiles!follow_requests_follower_id_fkey (
          id, full_name, avatar_url, is_private
        )
      `)
      .eq("following_id", profileId)
      .eq("status", "accepted")
      .range(offset, offset + limit - 1)

    if (error) {
      this.handleError(error, `getFollowers(${profileId})`)
      return []
    }
    return ((data ?? []) as any[])
      .map((r) => r.profiles)
      .filter(Boolean) as ProfileSummary[]
  }

  /**
   * Get profiles that a user is following (accepted).
   */
  async getFollowing(
    profileId: string,
    limit = 50,
    offset = 0
  ): Promise<ProfileSummary[]> {
    const { data, error } = await this.db
      .from("follow_requests")
      .select(`
        following_id,
        profiles!follow_requests_following_id_fkey (
          id, full_name, avatar_url, is_private
        )
      `)
      .eq("follower_id", profileId)
      .eq("status", "accepted")
      .range(offset, offset + limit - 1)

    if (error) {
      this.handleError(error, `getFollowing(${profileId})`)
      return []
    }
    return ((data ?? []) as any[])
      .map((r) => r.profiles)
      .filter(Boolean) as ProfileSummary[]
  }

  /**
   * Get incoming pending follow requests for a user.
   */
  async getPendingRequests(
    profileId: string,
    limit = 50,
    offset = 0
  ): Promise<(FollowRequestRow & { follower: ProfileSummary })[]> {
    const { data, error } = await this.db
      .from("follow_requests")
      .select(`
        id, follower_id, following_id, status, created_at, updated_at,
        profiles!follow_requests_follower_id_fkey (
          id, full_name, avatar_url, is_private
        )
      `)
      .eq("following_id", profileId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      this.handleError(error, `getPendingRequests(${profileId})`)
      return []
    }

    return ((data ?? []) as any[]).map((r) => ({
      id:           r.id,
      follower_id:  r.follower_id,
      following_id: r.following_id,
      status:       r.status,
      created_at:   r.created_at,
      updated_at:   r.updated_at,
      follower:     r.profiles,
    }))
  }

  // -----------------------------------------------------------------------
  // COUNTS (denormalized columns on profiles — maintained by DB trigger)
  // -----------------------------------------------------------------------

  /**
   * Fetch follower and following counts in a single round-trip.
   * Reads directly from profiles.follower_count / profiles.following_count,
   * which are kept fresh by the trg_update_follower_counts trigger.
   */
  async getCounts(
    profileId: string
  ): Promise<{ followerCount: number; followingCount: number }> {
    const { data, error } = await (this.db as any)
      .from("profiles")
      .select("follower_count, following_count")
      .eq("id", profileId)
      .maybeSingle()

    if (error) {
      this.handleError(error, `getCounts(${profileId})`)
      return { followerCount: 0, followingCount: 0 }
    }
    return {
      followerCount:  data?.follower_count  ?? 0,
      followingCount: data?.following_count ?? 0,
    }
  }

  async getFollowerCount(profileId: string): Promise<number> {
    const { followerCount } = await this.getCounts(profileId)
    return followerCount
  }

  async getFollowingCount(profileId: string): Promise<number> {
    const { followingCount } = await this.getCounts(profileId)
    return followingCount
  }
}

export const followDB = FollowTable.getInstance()
