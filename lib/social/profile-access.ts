import "server-only"

import { auth } from "@clerk/nextjs/server"
import { normalizeUsername } from "@/lib/auth/username"
import { followDB } from "@/lib/database/follow-db"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

type FollowStatus = "none" | "pending" | "accepted"

export interface ResolvedProfileAccess {
  profile: {
    id: string
    full_name: string | null
    avatar_url: string | null
    is_private: boolean
    username: string | null
    full_name_hidden: boolean
    pinned_recipe_ids?: string[] | null
  }
  viewerProfileId: string | null
  isOwnProfile: boolean
  followStatus: FollowStatus
  canViewContent: boolean
}

const PROFILE_SELECT =
  "id, full_name, avatar_url, is_private, username, full_name_hidden, pinned_recipe_ids"

export async function resolveProfileAccess(
  rawIdentifier: string,
  options?: { allowIdFallback?: boolean }
): Promise<ResolvedProfileAccess | null> {
  const identifier = normalizeUsername(decodeURIComponent(rawIdentifier))
  const supabase = createServiceSupabaseClient()

  let { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("username", identifier)
    .maybeSingle()

  if (!profile && options?.allowIdFallback) {
    const { data: byId } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", identifier)
      .maybeSingle()

    profile = byId
  }

  if (!profile) return null

  const authState = await auth()
  const clerkUserId = authState.userId ?? null

  let viewerProfileId: string | null = null
  let isOwnProfile = false
  let followStatus: FollowStatus = "none"

  if (clerkUserId) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle()

    viewerProfileId = viewerProfile?.id ?? null
    isOwnProfile = viewerProfileId === profile.id

    if (viewerProfileId && !isOwnProfile) {
      const followResult = await followDB
        .withServiceClient(supabase)
        .getFollowStatus(viewerProfileId, profile.id)
      followStatus = followResult.status
    }
  }

  return {
    profile,
    viewerProfileId,
    isOwnProfile,
    followStatus,
    canViewContent: !profile.is_private || isOwnProfile || followStatus === "accepted",
  }
}
