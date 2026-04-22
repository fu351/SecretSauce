
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

// Type aliases for clarity and maintainability
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"]
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"]

// Simplified profile type for batch operations (e.g., recipe reviews)
export type ProfileMinimal = Pick<ProfileRow, "id" | "email" | "full_name">

// Export full profile type for convenience
export type Profile = ProfileRow

const PROFILE_SAFE_COLUMNS = [
  "id",
  "email",
  "full_name",
  "avatar_url",
  "cooking_level",
  "budget_range",
  "dietary_preferences",
  "primary_goal",
  "created_at",
  "updated_at",
  "cuisine_preferences",
  "cooking_time_preference",
  "zip_code",
  "grocery_distance_miles",
  "theme_preference",
  "tutorial_completed",
  "tutorial_completed_at",
  "formatted_address",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "country",
  "latitude",
  "longitude",
  "email_verified",
  "clerk_user_id",
  "username",
  "subscription_tier",
  "subscription_started_at",
  "subscription_expires_at",
  "subscription_status",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "stripe_current_period_end",
  "full_name_hidden",
].join(", ")

/**
 * Database operations for user profiles
 * Singleton class extending BaseTable with specialized profile operations
 */
class ProfileTable extends BaseTable<"profiles", ProfileRow, ProfileInsert, ProfileUpdate> {
  private static instance: ProfileTable | null = null
  readonly tableName = "profiles" as const

  private constructor() {
    super()
  }

  static getInstance(): ProfileTable {
    if (!ProfileTable.instance) {
      ProfileTable.instance = new ProfileTable()
    }
    return ProfileTable.instance
  }

  /**
   * Map raw database profile to typed Profile
   * Ensures all fields have proper defaults and types
   */
  protected map(dbItem: any): Profile {
    return {
      id: dbItem.id,
      email: dbItem.email,
      full_name: dbItem.full_name ?? null,
      avatar_url: dbItem.avatar_url ?? null,
      cooking_level: dbItem.cooking_level ?? null,
      budget_range: dbItem.budget_range ?? null,
      dietary_preferences: dbItem.dietary_preferences ?? null,
      primary_goal: dbItem.primary_goal ?? null,
      created_at: dbItem.created_at ?? null,
      updated_at: dbItem.updated_at ?? null,
      cuisine_preferences: dbItem.cuisine_preferences ?? [],
      cooking_time_preference: dbItem.cooking_time_preference ?? null,
      zip_code: dbItem.zip_code ?? null,
      grocery_distance_miles: dbItem.grocery_distance_miles ?? 10,
      theme_preference: dbItem.theme_preference ?? "dark",
      tutorial_completed: dbItem.tutorial_completed ?? false,
      tutorial_completed_at: dbItem.tutorial_completed_at ?? null,
      formatted_address: dbItem.formatted_address ?? null,
      address_line1: dbItem.address_line1 ?? null,
      address_line2: dbItem.address_line2 ?? null,
      city: dbItem.city ?? null,
      state: dbItem.state ?? null,
      country: dbItem.country ?? null,
      latitude: dbItem.latitude ?? null,
      longitude: dbItem.longitude ?? null,
      email_verified: dbItem.email_verified ?? null,
      clerk_user_id: dbItem.clerk_user_id ?? null,
      username: dbItem.username ?? null,
      subscription_tier: dbItem.subscription_tier ?? null,
      subscription_started_at: dbItem.subscription_started_at ?? null,
      subscription_expires_at: dbItem.subscription_expires_at ?? null,
      subscription_status: dbItem.subscription_status ?? null,
      stripe_customer_id: dbItem.stripe_customer_id ?? null,
      stripe_subscription_id: dbItem.stripe_subscription_id ?? null,
      stripe_price_id: dbItem.stripe_price_id ?? null,
      stripe_current_period_end: dbItem.stripe_current_period_end ?? null,
      is_private: dbItem.is_private ?? false,
      full_name_hidden: dbItem.full_name_hidden ?? false,
      follower_count: dbItem.follower_count ?? 0,
      following_count: dbItem.following_count ?? 0,
    }
  }

  /**
   * Override findById with special PGRST116 handling
   * Fetch complete profile by user ID
   * Used by AuthContext, Settings page, and other components needing full profile data
   */
  async findById(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(PROFILE_SAFE_COLUMNS)
      .eq("id", userId)
      .single()

    if (error) {
      // Special handling for PGRST116 (not found) - caller decides how to handle
      if (error.code === "PGRST116") {
        console.warn("[Profile DB] Profile not found for user:", userId)
        return null
      }
      this.handleError(error, `findById(${userId})`)
      return null
    }

    return data ? this.map(data) : null
  }

  /**
   * Alias for findById to maintain backwards compatibility
   */
  async fetchProfileById(userId: string): Promise<Profile | null> {
    return this.findById(userId)
  }

  /**
   * Fetch profile by email (for onboarding flow before authentication)
   */
  async fetchProfileByEmail(email: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(PROFILE_SAFE_COLUMNS)
      .eq("email", email)
      .maybeSingle()

    if (error) {
      this.handleError(error, "fetchProfileByEmail")
      return null
    }

    return data ? this.map(data) : null
  }

  /**
   * Fetch profile by Clerk user id
   */
  async fetchProfileByClerkUserId(clerkUserId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(PROFILE_SAFE_COLUMNS)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    if (error) {
      this.handleError(error, "fetchProfileByClerkUserId")
      return null
    }

    return data ? this.map(data) : null
  }

  /**
   * Fetch specific profile fields (optimized for performance)
   * Use this when you only need certain fields to reduce payload size
   * @param userId - User ID to fetch
   * @param fields - Array of field names to select
   */
  async fetchProfileFields<T extends keyof ProfileRow>(
    userId: string,
    fields: T[]
  ): Promise<Pick<ProfileRow, T> | null> {
    const selectedFields = fields.map((field) => String(field))
    if (selectedFields.length === 0) return null

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(selectedFields.join(", "))
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      this.handleError(error, "fetchProfileFields")
      return null
    }

    return data as Pick<ProfileRow, T> | null
  }

  /**
   * Batch fetch multiple profiles (for reviews, comments, etc.)
   * More efficient than N+1 individual queries
   * @param userIds - Array of user IDs
   * @param fields - Optional fields to select (defaults to minimal set for reviews)
   */
  async fetchProfilesBatch(
    userIds: string[],
    fields: string[] = ["id", "email", "full_name"]
  ): Promise<ProfileMinimal[]> {
    if (!userIds || userIds.length === 0) {
      console.warn("[Profile DB] fetchProfilesBatch called with empty userIds")
      return []
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select(fields.join(", "))
      .in("id", userIds)

    if (error) {
      this.handleError(error, "fetchProfilesBatch")
      return []
    }

    return (data || []) as ProfileMinimal[]
  }

  /**
   * Create a new profile (INSERT)
   * Used as fallback when database trigger fails to create profile
   */
  async createProfile(profileData: ProfileInsert): Promise<Profile | null> {
    return this.create(profileData)
  }

  /**
   * Override update to automatically include updated_at timestamp
   * @param userId - User ID to update
   * @param updates - Partial profile updates
   */
  async update(userId: string, updates: ProfileUpdate): Promise<Profile | null> {
    return super.update(userId, {
      ...updates,
      updated_at: new Date().toISOString(),
    } as ProfileUpdate)
  }

  /**
   * Update existing profile (UPDATE)
   * Alias for update method
   */
  async updateProfile(userId: string, updates: ProfileUpdate): Promise<Profile | null> {
    return this.update(userId, updates)
  }

  /**
   * Upsert profile (INSERT or UPDATE)
   * Used for onboarding (email-based) and AuthContext updates
   * Automatically includes updated_at timestamp
   * @param profileData - Profile data to insert/update (id optional when using onConflict)
   * @param options - Optional upsert options (e.g., onConflict)
   */
  async upsertProfile(
    profileData: Partial<ProfileInsert> & { email: string },
    options?: { onConflict?: string }
  ): Promise<Profile | null> {

    const upsertOptions = options?.onConflict ? { onConflict: options.onConflict } : undefined

    const { data, error } = await this.supabase
      .from(this.tableName)
      .upsert(
        {
          ...profileData,
          updated_at: new Date().toISOString(),
        } as any,
        upsertOptions
      )
      .select(PROFILE_SAFE_COLUMNS)
      .single()

    if (error) {
      this.handleError(error, "upsertProfile")
      return null
    }

    return data ? this.map(data) : null
  }

}

// Export singleton instance
export const profileDB = ProfileTable.getInstance()
