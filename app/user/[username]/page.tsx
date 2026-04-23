import { notFound } from "next/navigation"
import { ProfileIdentityControls } from "@/components/social/profile-identity-controls"
import { ProfileContentTabs } from "@/components/social/profile-content-tabs"
import { ProfileStoriesRail } from "@/components/social/profile-stories-rail"
import { PinnedRecipesSection } from "@/components/social/pinned-recipes-section"
import { resolveProfileAccess } from "@/lib/social/profile-access"

interface Props {
  params: Promise<{ username: string }>
}

export default async function UserProfilePage({ params }: Props) {
  const { username: rawUsername } = await params
  const access = await resolveProfileAccess(rawUsername, { allowIdFallback: true })

  if (!access) notFound()

  const { profile, viewerProfileId, followStatus, isOwnProfile, canViewContent } = access
  const resolvedUsername = profile.username ?? decodeURIComponent(rawUsername)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-4 sm:py-6">
        <ProfileIdentityControls
          isOwnProfile={isOwnProfile}
          profileId={profile.id}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
          username={profile.username}
          isPrivate={profile.is_private}
          fullNameHidden={profile.full_name_hidden}
          showFollowButton={Boolean(viewerProfileId) && !isOwnProfile}
          initialFollowStatus={followStatus}
        />

        {profile.username && canViewContent ? (
          <PinnedRecipesSection username={profile.username} />
        ) : null}

        {profile.username ? (
          <ProfileStoriesRail username={profile.username} />
        ) : null}

        {profile.username ? (
          <ProfileContentTabs
            username={resolvedUsername}
            isOwnProfile={isOwnProfile}
            canViewContent={canViewContent}
          />
        ) : null}
      </div>
    </div>
  )
}
