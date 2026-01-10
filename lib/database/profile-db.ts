"use client"

import { useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/lib/supabase"

/**
 * Universal database operations for user profiles
 * Separated from state management for reusability across different components
 */

// Type aliases for clarity and maintainability
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"]
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"]

// Simplified profile type for batch operations (e.g., recipe reviews)
export type ProfileMinimal = Pick<ProfileRow, "id" | "email" | "full_name">

// Export full profile type for convenience
export type Profile = ProfileRow

export function useProfileDB() {
  /**
   * Map raw database profile to typed Profile
   * Ensures all fields have proper defaults and types
   */
  const mapProfile = useCallback((dbItem: any): Profile => {
    return {
      id: dbItem.id,
      email: dbItem.email,
      full_name: dbItem.full_name ?? null,
      avatar_url: dbItem.avatar_url ?? null,
      cooking_level: dbItem.cooking_level ?? null,
      budget_range: dbItem.budget_range ?? null,
      dietary_preferences: dbItem.dietary_preferences ?? null,
      cuisine_preferences: dbItem.cuisine_preferences ?? [],
      postal_code: dbItem.postal_code ?? null,
      grocery_distance_miles: dbItem.grocery_distance_miles ?? 10,
      theme_preference: dbItem.theme_preference ?? "dark",
      formatted_address: dbItem.formatted_address ?? null,
      latitude: dbItem.latitude ?? null,
      longitude: dbItem.longitude ?? null,
      tutorial_completed: dbItem.tutorial_completed ?? false,
      created_at: dbItem.created_at,
      updated_at: dbItem.updated_at
    }
  }, [])

  /**
   * Fetch complete profile by user ID
   * Used by AuthContext, Settings page, and other components needing full profile data
   */
  const fetchProfileById = useCallback(async (userId: string): Promise<Profile | null> => {
    console.log("[Profile DB] Fetching profile for user:", userId)

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (error) {
      // Special handling for PGRST116 (not found) - caller decides how to handle
      if (error.code === "PGRST116") {
        console.warn("[Profile DB] Profile not found for user:", userId)
        return null
      }
      console.warn("[Profile DB] Error fetching profile:", error.message)
      return null
    }

    return data ? mapProfile(data) : null
  }, [mapProfile])

  /**
   * Fetch profile by email (for onboarding flow before authentication)
   */
  const fetchProfileByEmail = useCallback(async (email: string): Promise<Profile | null> => {
    console.log("[Profile DB] Fetching profile by email")

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .maybeSingle()

    if (error) {
      console.warn("[Profile DB] Error fetching profile by email:", error.message)
      return null
    }

    return data ? mapProfile(data) : null
  }, [mapProfile])

  /**
   * Fetch specific profile fields (optimized for performance)
   * Use this when you only need certain fields to reduce payload size
   * @param userId - User ID to fetch
   * @param fields - Array of field names to select
   */
  const fetchProfileFields = useCallback(async <T extends keyof ProfileRow>(
    userId: string,
    fields: T[]
  ): Promise<Pick<ProfileRow, T> | null> => {
    console.log("[Profile DB] Fetching profile fields:", fields)

    const { data, error } = await supabase
      .from("profiles")
      .select(fields.join(", "))
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      console.warn("[Profile DB] Error fetching profile fields:", error.message)
      return null
    }

    return data as Pick<ProfileRow, T> | null
  }, [])

  /**
   * Batch fetch multiple profiles (for reviews, comments, etc.)
   * More efficient than N+1 individual queries
   * @param userIds - Array of user IDs
   * @param fields - Optional fields to select (defaults to minimal set for reviews)
   */
  const fetchProfilesBatch = useCallback(async (
    userIds: string[],
    fields: string[] = ["id", "email", "full_name"]
  ): Promise<ProfileMinimal[]> => {
    if (!userIds || userIds.length === 0) {
      console.warn("[Profile DB] fetchProfilesBatch called with empty userIds")
      return []
    }

    console.log("[Profile DB] Batch fetching profiles:", userIds.length)

    const { data, error } = await supabase
      .from("profiles")
      .select(fields.join(", "))
      .in("id", userIds)

    if (error) {
      console.warn("[Profile DB] Error batch fetching profiles:", error.message)
      return []
    }

    return (data || []) as ProfileMinimal[]
  }, [])

  /**
   * Create a new profile (INSERT)
   * Used as fallback when database trigger fails to create profile
   */
  const createProfile = useCallback(async (
    profileData: ProfileInsert
  ): Promise<Profile | null> => {
    console.log("[Profile DB] Creating profile for:", profileData.email)

    const { data, error } = await supabase
      .from("profiles")
      .insert(profileData)
      .select("*")
      .single()

    if (error) {
      console.error("[Profile DB] Error creating profile:", error)
      return null
    }

    console.log("[Profile DB] Profile created successfully")
    return data ? mapProfile(data) : null
  }, [mapProfile])

  /**
   * Update existing profile (UPDATE)
   * Automatically includes updated_at timestamp
   * @param userId - User ID to update
   * @param updates - Partial profile updates
   */
  const updateProfile = useCallback(async (
    userId: string,
    updates: ProfileUpdate
  ): Promise<Profile | null> => {
    console.log("[Profile DB] Updating profile:", userId)

    const { data, error } = await supabase
      .from("profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select("*")
      .single()

    if (error) {
      console.error("[Profile DB] Error updating profile:", error)
      return null
    }

    console.log("[Profile DB] Profile updated successfully")
    return data ? mapProfile(data) : null
  }, [mapProfile])

  /**
   * Upsert profile (INSERT or UPDATE)
   * Used for onboarding (email-based) and AuthContext updates
   * Automatically includes updated_at timestamp
   * @param profileData - Profile data to insert/update (id optional when using onConflict)
   * @param options - Optional upsert options (e.g., onConflict)
   */
  const upsertProfile = useCallback(async (
    profileData: Partial<ProfileInsert> & { email: string },
    options?: { onConflict?: string }
  ): Promise<Profile | null> => {
    console.log("[Profile DB] Upserting profile")

    const upsertOptions = options?.onConflict
      ? { onConflict: options.onConflict }
      : undefined

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        ...profileData,
        updated_at: new Date().toISOString()
      }, upsertOptions)
      .select("*")
      .single()

    if (error) {
      console.error("[Profile DB] Error upserting profile:", error)
      return null
    }

    console.log("[Profile DB] Profile upserted successfully")
    return data ? mapProfile(data) : null
  }, [mapProfile])

  /**
   * Update tutorial completion status
   * Specialized operation for tutorial flow
   * @param userId - User ID
   * @param tutorialPath - Tutorial path (cooking, budgeting, health)
   */
  const updateTutorialCompletion = useCallback(async (
    userId: string,
    tutorialPath: ProfileRow["tutorial_path"]
  ): Promise<boolean> => {
    console.log("[Profile DB] Updating tutorial completion")

    const { error } = await supabase
      .from("profiles")
      .update({
        tutorial_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)

    if (error) {
      console.error("[Profile DB] Error updating tutorial completion:", error)
      return false
    }

    console.log("[Profile DB] Tutorial completion updated successfully")
    return true
  }, [])

  return useMemo(() => ({
    mapProfile,
    fetchProfileById,
    fetchProfileByEmail,
    fetchProfileFields,
    fetchProfilesBatch,
    createProfile,
    updateProfile,
    upsertProfile,
    updateTutorialCompletion
  }), [
    mapProfile,
    fetchProfileById,
    fetchProfileByEmail,
    fetchProfileFields,
    fetchProfilesBatch,
    createProfile,
    updateProfile,
    upsertProfile,
    updateTutorialCompletion
  ])
}
