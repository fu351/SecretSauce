import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { normalizeUsername } from "@/lib/auth/username"
import {
  BADGE_DEFINITIONS,
  EARLY_ADOPTER_CUTOFF,
  type BadgeId,
} from "@/lib/badges/badge-definitions"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username: rawUsername } = await params
    const username = normalizeUsername(decodeURIComponent(rawUsername))

    const supabase = createServiceSupabaseClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, follower_count, subscription_tier, created_at, showcased_badge_ids")
      .eq("username", username)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Compute criteria in parallel
    const [recipeCountResult, participantResult, winnerResult] = await Promise.all([
      supabase
        .from("recipes")
        .select("id", { count: "exact", head: true })
        .eq("author_id", profile.id)
        .is("deleted_at", null),
      // Participant: has at least one challenge entry with a submitted post
      supabase
        .from("challenge_entries")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .not("post_id", "is", null),
      // Winner: appears in the challenge_winners table (staff-selected star winners)
      supabase
        .from("challenge_winners")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id),
    ])

    const recipeCount    = recipeCountResult.count ?? 0
    const followerCount  = profile.follower_count ?? 0
    const isPremium      = profile.subscription_tier === "premium"
    const isEarlyAdopter = profile.created_at != null && profile.created_at < EARLY_ADOPTER_CUTOFF

    const eligibleBadgeIds: BadgeId[] = []
    if (recipeCount >= 1)   eligibleBadgeIds.push("first_recipe")
    if (recipeCount >= 5)   eligibleBadgeIds.push("recipe_creator_5")
    if (recipeCount >= 25)  eligibleBadgeIds.push("recipe_creator_25")
    if (recipeCount >= 100) eligibleBadgeIds.push("recipe_creator_100")
    if (followerCount >= 5)   eligibleBadgeIds.push("social_starter")
    if (followerCount >= 25)  eligibleBadgeIds.push("popular_chef")
    if (followerCount >= 100) eligibleBadgeIds.push("fan_favorite")
    if ((participantResult.count ?? 0) >= 1) eligibleBadgeIds.push("challenge_participant")
    if ((winnerResult.count ?? 0) >= 1)      eligibleBadgeIds.push("challenge_winner")
    if (isPremium)      eligibleBadgeIds.push("premium_member")
    if (isEarlyAdopter) eligibleBadgeIds.push("early_adopter")

    // Upsert newly earned badges
    if (eligibleBadgeIds.length > 0) {
      await supabase.from("user_badges").upsert(
        eligibleBadgeIds.map((badge_id) => ({ profile_id: profile.id, badge_id })),
        { onConflict: "profile_id,badge_id", ignoreDuplicates: true }
      )
    }

    // Fetch all stored badges
    const { data: storedBadges } = await supabase
      .from("user_badges")
      .select("badge_id, earned_at")
      .eq("profile_id", profile.id)
      .order("earned_at", { ascending: true })

    const badges = (storedBadges ?? [])
      .filter((b) => b.badge_id in BADGE_DEFINITIONS)
      .map((b) => ({
        ...BADGE_DEFINITIONS[b.badge_id as BadgeId],
        earnedAt: b.earned_at,
      }))

    return NextResponse.json({
      badges,
      showcasedBadgeIds: profile.showcased_badge_ids ?? [],
    })
  } catch (error) {
    console.error("[users/badges GET] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
