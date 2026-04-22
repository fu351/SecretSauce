import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { normalizeUsername } from "@/lib/auth/username"
import { Card, CardContent } from "@/components/ui/card"
import { ProfileIdentityControls } from "@/components/social/profile-identity-controls"
import { ProfileFollowButton } from "@/components/social/profile-follow-button"
import { UserRecipeGrid } from "@/components/social/user-recipe-grid"

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

  // Fall back to ID-based lookup (e.g. when a user has no username set)
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
  const { followerCount, followingCount } = await db.getCounts(profile.id)

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
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">

        <ProfileIdentityControls
          isOwnProfile={isOwnProfile}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
          username={profile.username}
          isPrivate={profile.is_private}
          fullNameHidden={profile.full_name_hidden}
        />

        <Card className="mb-8 border-border/60 bg-card/90 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-6">
                <div>
                  <p className="text-xl font-semibold text-foreground">{followerCount}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Followers</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <p className="text-xl font-semibold text-foreground">{followingCount}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Following</p>
                </div>
              </div>

              {!isOwnProfile && authState.userId ? (
                <ProfileFollowButton
                  targetProfileId={profile.id}
                  initialStatus={followStatus}
                  isPrivate={profile.is_private}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Recipes</h2>
          <UserRecipeGrid username={username} />
        </section>
      </div>
    </div>
  )
}
