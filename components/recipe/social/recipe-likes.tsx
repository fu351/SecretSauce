"use client"

import Image from "next/image"
import Link from "next/link"
import { ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import clsx from "clsx"

type FriendProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  username: string | null
}

interface RecipeLikesProps {
  recipeId: string
  likeCount: number
  isLiked: boolean
  friendLikes: FriendProfile[]
  isAuthenticated: boolean
  isDark: boolean
  onLikeToggle: (liked: boolean, newCount: number) => void
}

function MiniAvatar({ profile }: { profile: FriendProfile }) {
  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"
  const href = profile.username ? `/user/${profile.username}` : "#"
  return (
    <Link href={href} title={profile.full_name ?? "Chef"} className="flex-shrink-0">
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt={profile.full_name ?? "Chef"}
          width={24}
          height={24}
          className="rounded-full object-cover ring-2 ring-background"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-foreground">
          {initials}
        </div>
      )}
    </Link>
  )
}

function buildFriendLabel(friends: FriendProfile[], likeCount: number): string {
  if (friends.length === 0) return ""
  const others = likeCount - friends.length
  const names = friends.slice(0, 2).map((f) => f.full_name?.split(" ")[0] ?? "Someone")

  if (friends.length === 1 && others === 0) return `${names[0]} liked this`
  if (friends.length === 1) return `${names[0]} and ${others} other${others > 1 ? "s" : ""} liked this`
  if (others <= 0) return `${names.join(" and ")} liked this`
  return `${names[0]}, ${names[1]}, and ${others} other${others > 1 ? "s" : ""} liked this`
}

export function RecipeLikes({
  recipeId,
  likeCount,
  isLiked,
  friendLikes,
  isAuthenticated,
  isDark,
  onLikeToggle,
}: RecipeLikesProps) {
  const handleClick = async () => {
    if (!isAuthenticated) return

    const method = isLiked ? "DELETE" : "POST"
    // Optimistic update
    onLikeToggle(!isLiked, isLiked ? likeCount - 1 : likeCount + 1)

    try {
      const res = await fetch(`/api/recipes/${recipeId}/likes`, { method })
      if (res.ok) {
        const json = await res.json()
        onLikeToggle(!isLiked, json.likeCount)
      } else {
        // Revert on failure
        onLikeToggle(isLiked, likeCount)
      }
    } catch {
      onLikeToggle(isLiked, likeCount)
    }
  }

  const friendLabel = buildFriendLabel(friendLikes, likeCount)

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={!isAuthenticated}
        className={clsx(
          "flex items-center gap-1.5 px-3 h-8 rounded-full border transition-colors",
          isLiked
            ? isDark
              ? "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
              : "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
            : isDark
            ? "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
            : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50",
        )}
        title={isAuthenticated ? (isLiked ? "Unlike" : "Like this recipe") : "Sign in to like"}
      >
        <ThumbsUp
          className={clsx("h-3.5 w-3.5", isLiked ? "fill-current" : "")}
        />
        <span className="text-xs font-medium">{likeCount > 0 ? likeCount : "Like"}</span>
      </Button>

      {friendLikes.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1">
            {friendLikes.slice(0, 3).map((f) => (
              <MiniAvatar key={f.id} profile={f} />
            ))}
          </div>
          <span className={clsx("text-xs", isDark ? "text-muted-foreground" : "text-gray-500")}>
            {friendLabel}
          </span>
        </div>
      )}
    </div>
  )
}
