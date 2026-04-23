import type { SupabaseClient } from "@supabase/supabase-js"
import type { BadgeId } from "./badge-definitions"

/**
 * Upsert one or more badges for a profile.
 * Silently no-ops on duplicate (badge already earned).
 * Requires a service-role Supabase client.
 */
export async function awardBadges(
  supabase: SupabaseClient,
  profileId: string,
  badgeIds: BadgeId[]
): Promise<void> {
  if (badgeIds.length === 0) return
  await supabase.from("user_badges").upsert(
    badgeIds.map((badge_id) => ({ profile_id: profileId, badge_id })),
    { onConflict: "profile_id,badge_id", ignoreDuplicates: true }
  )
}
