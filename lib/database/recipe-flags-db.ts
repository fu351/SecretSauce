import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase, type Database } from "@/lib/database/supabase"

export type RecipeFlagStatus = "open" | "reviewing" | "resolved" | "dismissed"
export type RecipeFlagSeverity = "low" | "medium" | "high"

export type RecipeFlagRow = Database["public"]["Tables"]["recipe_flags"]["Row"]
export type RecipeFlagInsert = Database["public"]["Tables"]["recipe_flags"]["Insert"]
export type RecipeFlagUpdate = Database["public"]["Tables"]["recipe_flags"]["Update"]

export type RecipeFlagWithContext = RecipeFlagRow & {
  recipe_title?: string | null
  reporter_name?: string | null
  reporter_username?: string | null
  resolver_name?: string | null
}

class RecipeFlagsDB {
  constructor(private readonly client: SupabaseClient<Database> = supabase) {}

  async createFlag(input: {
    recipeId: string
    reporterProfileId: string | null
    reason: string
    details?: string | null
    severity?: RecipeFlagSeverity
  }): Promise<RecipeFlagRow | null> {
    const payload: RecipeFlagInsert = {
      recipe_id: input.recipeId,
      reporter_profile_id: input.reporterProfileId,
      reason: input.reason.trim(),
      details: input.details?.trim() || null,
      severity: input.severity || "medium",
      status: "open",
    }

    const { data, error } = await this.client
      .from("recipe_flags")
      .insert(payload as any)
      .select("*")
      .single()

    if (error) {
      console.error("[RecipeFlagsDB] createFlag error:", error)
      return null
    }

    return data as RecipeFlagRow
  }

  async fetchOpenFlags(limit = 50): Promise<RecipeFlagWithContext[]> {
    const { data, error } = await this.client
      .from("recipe_flags")
      .select(`
        *,
        recipes!recipe_flags_recipe_id_fkey (
          title
        ),
        reporter:profiles!recipe_flags_reporter_profile_id_fkey (
          full_name,
          username
        ),
        resolver:profiles!recipe_flags_resolved_by_fkey (
          full_name
        )
      `)
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[RecipeFlagsDB] fetchOpenFlags error:", error)
      return []
    }

    return (data || []).map((row: any) => ({
      ...row,
      recipe_title: row.recipes?.title ?? null,
      reporter_name: row.reporter?.full_name ?? null,
      reporter_username: row.reporter?.username ?? null,
      resolver_name: row.resolver?.full_name ?? null,
    }))
  }

  async fetchFlagsForRecipe(recipeId: string, limit = 25): Promise<RecipeFlagWithContext[]> {
    const { data, error } = await this.client
      .from("recipe_flags")
      .select(`
        *,
        reporter:profiles!recipe_flags_reporter_profile_id_fkey (
          full_name,
          username
        ),
        resolver:profiles!recipe_flags_resolved_by_fkey (
          full_name
        )
      `)
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[RecipeFlagsDB] fetchFlagsForRecipe error:", error)
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
    status: Exclude<RecipeFlagStatus, "open" | "reviewing"> = "resolved"
  ): Promise<boolean> {
    const { error } = await this.client
      .from("recipe_flags")
      .update({
        status,
        resolution: resolution.trim() || null,
        resolved_by: resolverProfileId,
        resolved_at: new Date().toISOString(),
      } satisfies RecipeFlagUpdate)
      .eq("id", flagId)

    if (error) {
      console.error("[RecipeFlagsDB] resolveFlag error:", error)
      return false
    }

    return true
  }

  async markReviewing(flagId: string): Promise<boolean> {
    const { error } = await this.client
      .from("recipe_flags")
      .update({ status: "reviewing" } satisfies RecipeFlagUpdate)
      .eq("id", flagId)

    if (error) {
      console.error("[RecipeFlagsDB] markReviewing error:", error)
      return false
    }

    return true
  }
}

export const recipeFlagsDB = new RecipeFlagsDB()
export { RecipeFlagsDB }
