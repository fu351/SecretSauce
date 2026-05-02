import {
  buildPreferenceDbUpdate,
  DEFAULT_USER_FEATURE_PREFERENCES,
  normalizeUserFeaturePreferences,
  type UserFeaturePreferences,
} from "@/lib/foundation/preferences"

type SupabaseClientLike = {
  from: (table: string) => any
}

export async function getOrCreateUserFeaturePreferences(
  supabase: SupabaseClientLike,
  profileId: string,
): Promise<{ preferences: UserFeaturePreferences; error: unknown | null }> {
  const existing = await (supabase as any)
    .from("user_feature_preferences")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle()

  if (existing.error) {
    return { preferences: DEFAULT_USER_FEATURE_PREFERENCES, error: existing.error }
  }

  if (existing.data) {
    return { preferences: normalizeUserFeaturePreferences(existing.data), error: null }
  }

  const created = await (supabase as any)
    .from("user_feature_preferences")
    .insert({
      profile_id: profileId,
      ...buildPreferenceDbUpdate(DEFAULT_USER_FEATURE_PREFERENCES),
    })
    .select("*")
    .maybeSingle()

  if (created.error) {
    if (created.error.code === "23505" || created.error.code === "PGRST116") {
      const retry = await (supabase as any)
        .from("user_feature_preferences")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle()

      if (!retry.error && retry.data) {
        return { preferences: normalizeUserFeaturePreferences(retry.data), error: null }
      }
    }

    return { preferences: DEFAULT_USER_FEATURE_PREFERENCES, error: created.error }
  }

  return { preferences: normalizeUserFeaturePreferences(created.data), error: null }
}

export async function updateUserFeaturePreferences(
  supabase: SupabaseClientLike,
  profileId: string,
  input: unknown,
): Promise<{ preferences?: UserFeaturePreferences; validationError?: string; error?: unknown }> {
  const update = buildPreferenceDbUpdate(input)
  if (Object.keys(update).length === 0) {
    return { validationError: "No valid preference fields to update" }
  }

  const { data, error } = await (supabase as any)
    .from("user_feature_preferences")
    .upsert(
      {
        profile_id: profileId,
        ...update,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single()

  if (error) {
    return { error }
  }

  return { preferences: normalizeUserFeaturePreferences(data) }
}
