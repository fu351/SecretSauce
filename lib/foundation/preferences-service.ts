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
  const { data, error } = await (supabase as any)
    .from("user_feature_preferences")
    .upsert(
      {
        profile_id: profileId,
        ...buildPreferenceDbUpdate(DEFAULT_USER_FEATURE_PREFERENCES),
      },
      { onConflict: "profile_id", ignoreDuplicates: true },
    )
    .select("*")
    .single()

  if (error) {
    return { preferences: DEFAULT_USER_FEATURE_PREFERENCES, error }
  }

  return { preferences: normalizeUserFeaturePreferences(data), error: null }
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
