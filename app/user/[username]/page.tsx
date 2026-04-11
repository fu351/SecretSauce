import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import Image from "next/image"
import Link from "next/link"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { followDB } from "@/lib/database/follow-db"
import { normalizeUsername } from "@/lib/auth/username"
import { ProfileFollowButton } from "@/components/social/profile-follow-button"
import { Badge } from "@/components/ui/badge"
import { Lock, Globe, ChefHat } from "lucide-react"

interface Props {
  params: Promise<{ username: string }>
}

export default async function UserProfilePage({ params }: Props) {
  const { username: rawUsername } = await params
  const username = normalizeUsername(decodeURIComponent(rawUsername))

  const supabase = createServiceSupabaseClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, is_private, username")
    .eq("username", username)
    .maybeSingle()

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

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, image_url, description, cuisine")
    .eq("author_id", profile.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(24)

  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8dcc4]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Avatar + name */}
        <div className="flex items-center gap-5 mb-8">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.full_name ?? "Profile"}
              width={80}
              height={80}
              className="rounded-full object-cover ring-2 ring-[#e8dcc4]/20"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#1a1a1a] ring-2 ring-[#e8dcc4]/20 flex items-center justify-center text-2xl font-semibold text-[#e8dcc4]">
              {initials}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-[#e8dcc4]">
              {profile.full_name ?? "Anonymous Chef"}
            </h1>
            <p className="text-sm text-[#e8dcc4]/60 mt-0.5">@{profile.username}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {profile.is_private ? (
                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1 text-xs border-[#e8dcc4]/20 text-[#e8dcc4]/60">
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
            <p className="text-2xl font-bold text-[#e8dcc4]">{followerCount}</p>
            <p className="text-sm text-[#e8dcc4]/60">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#e8dcc4]">{followingCount}</p>
            <p className="text-sm text-[#e8dcc4]/60">Following</p>
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
          <h2 className="text-lg font-semibold text-[#e8dcc4] mb-4">Recipes</h2>
          {recipes && recipes.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {recipes.map((recipe) => (
                <Link
                  key={recipe.id}
                  href={`/recipes/${recipe.id}`}
                  className="group rounded-lg overflow-hidden bg-[#1a1a1a] ring-1 ring-[#e8dcc4]/10 hover:ring-[#e8dcc4]/30 transition-all"
                >
                  {recipe.image_url ? (
                    <div className="aspect-square relative">
                      <Image
                        src={recipe.image_url}
                        alt={recipe.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square bg-[#222] flex items-center justify-center">
                      <ChefHat className="h-8 w-8 text-[#e8dcc4]/20" />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm font-medium text-[#e8dcc4] line-clamp-2 leading-snug">
                      {recipe.title}
                    </p>
                    {recipe.cuisine && (
                      <p className="text-xs text-[#e8dcc4]/40 mt-1 capitalize">{recipe.cuisine}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#e8dcc4]/40">No recipes yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
