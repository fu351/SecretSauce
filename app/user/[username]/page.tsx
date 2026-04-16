import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import Image from "next/image"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { normalizeUsername } from "@/lib/auth/username"
import { ProfileFollowButton } from "@/components/social/profile-follow-button"
import { UserRecipeGrid } from "@/components/social/user-recipe-grid"
import { Badge } from "@/components/ui/badge"
import { Lock, Globe } from "lucide-react"

interface Props {
  params: Promise<{ username: string }>
}

export default async function UserProfilePage({ params }: Props) {
  const { username: rawUsername } = await params
  const username = normalizeUsername(decodeURIComponent(rawUsername))

  const supabase = createServiceSupabaseClient()

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, is_private, username")
    .eq("username", username)
    .maybeSingle()

  // Fall back to ID-based lookup (e.g. when a user has no username set)
  if (!profile) {
    const { data: byId } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, is_private, username")
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

  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Avatar + name */}
        <div className="flex items-center gap-5 mb-8">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.full_name ?? "Profile"}
              width={80}
              height={80}
              className="rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted ring-2 ring-border flex items-center justify-center text-2xl font-semibold text-foreground">
              {initials}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {profile.full_name ?? "Anonymous Chef"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">@{profile.username}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {profile.is_private ? (
                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  Public
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Follower / following counts */}
        <div className="flex gap-10 mb-8">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{followerCount}</p>
            <p className="text-sm text-muted-foreground">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{followingCount}</p>
            <p className="text-sm text-muted-foreground">Following</p>
          </div>
        </div>

        {/* Follow button — only shown to other authenticated users */}
        {!isOwnProfile && authState.userId && (
          <ProfileFollowButton
            targetProfileId={profile.id}
            initialStatus={followStatus}
            isPrivate={profile.is_private}
          />
        )}

        {/* Recipes */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recipes</h2>
          <UserRecipeGrid username={username} />
        </div>
      </div>
    </div>
  )
}
