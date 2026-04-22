import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { normalizeUsername } from "@/lib/auth/username"
import { ProfileIdentityControls } from "@/components/social/profile-identity-controls"
import { UserRecipeGrid } from "@/components/social/user-recipe-grid"
import { PinnedRecipesSection } from "@/components/social/pinned-recipes-section"

interface Props {
  params: Promise<{ username: string }>
}

export default async function UserProfilePage({ params }: Props) {
  const { username: rawUsername } = await params
  const username = normalizeUsername(decodeURIComponent(rawUsername))

  const supabase = createServiceSupabaseClient()

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, is_private, username, full_name_hidden")
    .eq("username", username)
    .maybeSingle()

  if (!profile) {
    const { data: byId } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, is_private, username, full_name_hidden")
      .eq("id", username)
      .maybeSingle()
    profile = byId
  }

  if (!profile) notFound()

  const db = followDB.withServiceClient(supabase)

  const authState = await auth()
  let followStatus: "none" | "pending" | "accepted" = "none"
  let isOwnProfile = false

  if (authState.userId) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", authState.userId)
      .maybeSingle()

    if (viewerProfile) {
      isOwnProfile = viewerProfile.id === profile.id

      if (!isOwnProfile) {
        const result = await db.getFollowStatus(viewerProfile.id, profile.id)
        if (result.status !== "none") {
          followStatus = result.status
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6 space-y-3">
        <ProfileIdentityControls
          isOwnProfile={isOwnProfile}
          profileId={profile.id}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
          username={profile.username}
          isPrivate={profile.is_private}
          fullNameHidden={profile.full_name_hidden}
          showFollowButton={Boolean(authState.userId)}
          initialFollowStatus={followStatus}
        />

        {/* Pinned recipes */}
        {profile.username && (
          <PinnedRecipesSection username={profile.username} />
        )}

        {/* All recipes */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recipes</h2>
          <UserRecipeGrid username={username} isOwnProfile={isOwnProfile} />
        </section>
      </div>
    </div>
  )
}
