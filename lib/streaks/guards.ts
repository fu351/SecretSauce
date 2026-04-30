import { getServerFeatureFallback } from "@/lib/foundation/feature-flags"
import { normalizeUserFeaturePreferences } from "@/lib/foundation/preferences"

type SupabaseLike = {
  from: (table: string) => any
}

export async function isStreaksEnabledForProfile(supabase: SupabaseLike, profileId: string): Promise<boolean> {
  const streaksFlag = getServerFeatureFallback("gamification_streaks")
  if (!streaksFlag) return false

  const { data } = await (supabase as any)
    .from("user_feature_preferences")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle()

  const preferences = normalizeUserFeaturePreferences(data)
  return preferences.streaksEnabled
}
