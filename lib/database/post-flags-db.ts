import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase, type Database } from "@/lib/database/supabase"

export type PostFlagStatus = "open" | "reviewing" | "resolved" | "dismissed"
export type PostFlagSeverity = "low" | "medium" | "high"

export type PostFlagRow = Database["public"]["Tables"]["post_flags"]["Row"]
export type PostFlagInsert = Database["public"]["Tables"]["post_flags"]["Insert"]
export type PostFlagUpdate = Database["public"]["Tables"]["post_flags"]["Update"]

export type PostFlagWithContext = PostFlagRow & {
  post_title?: string | null
  reporter_name?: string | null
  reporter_username?: string | null
  resolver_name?: string | null
}

class PostFlagsDB {
  constructor(private readonly client: SupabaseClient<Database> = supabase) {}

  async createFlag(input: {
    postId: string
    reporterProfileId: string | null
    reason: string
    details?: string | null
    severity?: PostFlagSeverity
  }): Promise<PostFlagRow | null> {
    const payload: PostFlagInsert = {
      post_id: input.postId,
      reporter_profile_id: input.reporterProfileId,
      reason: input.reason.trim(),
      details: input.details?.trim() || null,
      severity: input.severity || "medium",
      status: "open",
    }

    const { data, error } = await this.client
      .from("post_flags")
      .insert(payload as any)
      .select("*")
      .single()

    if (error) {
      console.error("[PostFlagsDB] createFlag error:", error)
      return null
    }

    return data as PostFlagRow
  }

  async fetchOpenFlags(limit = 50): Promise<PostFlagWithContext[]> {
    const { data, error } = await this.client
      .from("post_flags")
      .select(`
        *,
        posts!post_flags_post_id_fkey (
          title
        ),
        reporter:profiles!post_flags_reporter_profile_id_fkey (
          full_name,
          username
        ),
        resolver:profiles!post_flags_resolved_by_fkey (
          full_name
        )
      `)
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[PostFlagsDB] fetchOpenFlags error:", error)
      return []
    }

    return (data || []).map((row: any) => ({
      ...row,
      post_title: row.posts?.title ?? null,
      reporter_name: row.reporter?.full_name ?? null,
      reporter_username: row.reporter?.username ?? null,
      resolver_name: row.resolver?.full_name ?? null,
    }))
  }

  async fetchFlagsForPost(postId: string, limit = 25): Promise<PostFlagWithContext[]> {
    const { data, error } = await this.client
      .from("post_flags")
      .select(`
        *,
        reporter:profiles!post_flags_reporter_profile_id_fkey (
          full_name,
          username
        ),
        resolver:profiles!post_flags_resolved_by_fkey (
          full_name
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[PostFlagsDB] fetchFlagsForPost error:", error)
      return []
    }

    return (data || []).map((row: any) => ({
      ...row,
      reporter_name: row.reporter?.full_name ?? null,
      reporter_username: row.reporter?.username ?? null,
      resolver_name: row.resolver?.full_name ?? null,
    }))
  }

  async resolveFlag(
    flagId: string,
    resolverProfileId: string,
    resolution: string,
    status: Exclude<PostFlagStatus, "open" | "reviewing"> = "resolved",
  ): Promise<boolean> {
    const { error } = await this.client
      .from("post_flags")
      .update({
        status,
        resolution: resolution.trim() || null,
        resolved_by: resolverProfileId,
        resolved_at: new Date().toISOString(),
      } satisfies PostFlagUpdate)
      .eq("id", flagId)

    if (error) {
      console.error("[PostFlagsDB] resolveFlag error:", error)
      return false
    }

    return true
  }

  async markReviewing(flagId: string): Promise<boolean> {
    const { error } = await this.client
      .from("post_flags")
      .update({ status: "reviewing" } satisfies PostFlagUpdate)
      .eq("id", flagId)

    if (error) {
      console.error("[PostFlagsDB] markReviewing error:", error)
      return false
    }

    return true
  }
}

export const postFlagsDB = new PostFlagsDB()
export { PostFlagsDB }
