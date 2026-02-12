import { supabase } from "./supabase"

export type AdminRole = "admin" | "analyst"

/**
 * Database access for admin role checks and role records.
 * Uses RPC functions for authorization checks and table queries for role lookup.
 */
class AdminRolesDB {
  private readonly tableName = "ab_testing.admin_roles"

  async isAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("is_admin", {
      p_user_id: userId,
    })

    if (error) {
      console.error("[AdminRolesDB] isAdmin error:", error)
      return false
    }

    return data === true
  }

  async canViewAnalytics(userId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("can_view_analytics", {
      p_user_id: userId,
    })

    if (error) {
      console.error("[AdminRolesDB] canViewAnalytics error:", error)
      return false
    }

    return data === true
  }

  async getActiveRole(userId: string): Promise<AdminRole | null> {
    const { data, error } = await (supabase.from(this.tableName) as any)
      .select("role")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle()

    if (error) {
      console.error("[AdminRolesDB] getActiveRole error:", error)
      return null
    }

    return (data?.role as AdminRole | undefined) ?? null
  }
}

export const adminRolesDB = new AdminRolesDB()
