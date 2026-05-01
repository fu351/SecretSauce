import { getServerFeatureFallback } from "@/lib/foundation/feature-flags"
import { normalizeUserFeaturePreferences } from "@/lib/foundation/preferences"

type SupabaseLike = { from: (table: string) => any }

export async function isSocialEnabledForProfile(supabase: SupabaseLike, profileId: string): Promise<boolean> {
  if (!getServerFeatureFallback("social_layer")) return false
  const { data } = await (supabase as any)
    .from("user_feature_preferences")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle()
  return normalizeUserFeaturePreferences(data).socialEnabled
}
