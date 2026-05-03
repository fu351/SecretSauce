"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Bookmark, ThumbsUp, Repeat2, Share2, Check, ShoppingCart, CalendarDays } from "lucide-react"
import clsx from "clsx"
import { useAnalytics } from "@/hooks/use-analytics"

type FriendProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  username: string | null
}

interface RecipeActionBarProps {
  recipeId: string
  // Save / favourite
  isFavorite: boolean
  isSaving?: boolean
  onSaveClick: () => void
  // Like
  likeCount: number
  isLiked: boolean
  onLikeToggle: (liked: boolean, newCount: number) => void
  // Repost
  repostCount: number
  isReposted: boolean
  onRepostToggle: (reposted: boolean, newCount: number) => void
  // Basket
  onAddToBasket: () => void
  // Planner
  onAddToPlanner: () => void
  // Friends
  friendLikes: FriendProfile[]
  // Misc
  isAuthenticated: boolean
  isDark: boolean
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
          width={20}
          height={20}
          className="rounded-full object-cover ring-2 ring-background"
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[9px] font-semibold text-foreground">
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
  if (friends.length === 1 && others <= 0) return `${names[0]} liked this`
  if (friends.length === 1) return `${names[0]} and ${others} other${others > 1 ? "s" : ""} liked this`
  if (others <= 0) return `${names.join(" & ")} liked this`
  return `${names[0]}, ${names[1]}, and ${others} other${others > 1 ? "s" : ""} liked this`
}

export function RecipeActionBar({
  recipeId,
  isFavorite,
  isSaving = false,
  onSaveClick,
  likeCount,
  isLiked,
  onLikeToggle,
  repostCount,
  isReposted,
  onRepostToggle,
  onAddToBasket,
  onAddToPlanner,
  friendLikes,
  isAuthenticated,
  isDark,
}: RecipeActionBarProps) {
  const [copied, setCopied] = useState(false)
  const { trackEvent } = useAnalytics()

  const handleLike = async () => {
    if (!isAuthenticated) return
    const next = !isLiked
    trackEvent(next ? "recipe_liked" : "recipe_unliked", { recipe_id: recipeId })
    onLikeToggle(next, next ? likeCount + 1 : likeCount - 1)
    try {
      const res = await fetch(`/api/recipes/${recipeId}/likes`, {
        method: next ? "POST" : "DELETE",
      })
      if (res.ok) {
        const json = await res.json()
        onLikeToggle(next, json.likeCount)
      } else {
        onLikeToggle(!next, likeCount)
      }
    } catch {
      onLikeToggle(!next, likeCount)
    }
  }

  const handleRepost = async () => {
    if (!isAuthenticated) return
    const next = !isReposted
    trackEvent(next ? "recipe_reposted" : "recipe_unreposted", { recipe_id: recipeId })
    onRepostToggle(next, next ? repostCount + 1 : repostCount - 1)
    try {
      const res = await fetch(`/api/recipes/${recipeId}/reposts`, {
        method: next ? "POST" : "DELETE",
      })
      if (res.ok) {
        const json = await res.json()
        onRepostToggle(next, json.repostCount)
      } else {
        onRepostToggle(!next, repostCount)
      }
    } catch {
      onRepostToggle(!next, repostCount)
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/recipes/${recipeId}`
    trackEvent("recipe_shared", { recipe_id: recipeId, method: "copy_link" })
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const el = document.createElement("input")
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const base =
    "flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm font-medium transition-all select-none"

  const neutralClass = isDark
    ? `${base} border-border text-muted-foreground hover:text-foreground hover:bg-secondary`
    : `${base} border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50`

  const activeRedClass = isDark
    ? `${base} border-red-500/40 bg-red-500/15 text-red-400 hover:bg-red-500/25`
    : `${base} border-red-200 bg-red-50 text-red-500 hover:bg-red-100`

  const activeBlueClass = isDark
    ? `${base} border-blue-500/40 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25`
    : `${base} border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100`

  const activeGreenClass = isDark
    ? `${base} border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25`
    : `${base} border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100`

  const copiedClass = isDark
    ? `${base} border-emerald-500/40 bg-emerald-500/15 text-emerald-400`
    : `${base} border-emerald-200 bg-emerald-50 text-emerald-600`

  const friendLabel = buildFriendLabel(friendLikes, likeCount)

  const mobileTileBase = isDark
    ? "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-secondary/70 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
    : "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-white/80 text-[11px] font-medium text-gray-700 transition-colors hover:bg-white"

  const mobileTileActive = {
    save: isFavorite
      ? (isDark ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-red-200 bg-red-50 text-red-500")
      : mobileTileBase,
    like: isLiked
      ? (isDark ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-blue-200 bg-blue-50 text-blue-600")
      : mobileTileBase,
    repost: isReposted
      ? (isDark ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-600")
      : mobileTileBase,
    share: copied
      ? (isDark ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-600")
      : mobileTileBase,
  }

  return (
    <div className="space-y-2 pt-3">
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <button
          data-tutorial="recipe-favorite"
          type="button"
          className={mobileTileActive.save}
          onClick={onSaveClick}
          disabled={isSaving}
          title={isFavorite ? "Manage your saved folders" : "Save recipe"}
        >
          <Bookmark className={clsx("h-4 w-4", isFavorite ? "fill-current" : "")} />
          <span>{isSaving ? "Saving" : isFavorite ? "Saved" : "Save"}</span>
        </button>

        <button
          className={mobileTileActive.like}
          onClick={handleLike}
          disabled={!isAuthenticated}
          title={isAuthenticated ? (isLiked ? "Unlike" : "Like") : "Sign in to like"}
        >
          <ThumbsUp className={clsx("h-4 w-4", isLiked ? "fill-current" : "")} />
          <span>{likeCount > 0 ? `${likeCount} Likes` : "Like"}</span>
        </button>

        <button
          data-testid={`recipe-repost-button-${recipeId}`}
          className={mobileTileActive.repost}
          onClick={handleRepost}
          disabled={!isAuthenticated}
          aria-label={isReposted ? "Undo repost" : "Repost"}
          title={isAuthenticated ? (isReposted ? "Undo repost" : "Repost to your followers") : "Sign in to repost"}
        >
          <Repeat2 className="h-4 w-4" />
          <span data-testid={`recipe-repost-count-${recipeId}`}>{repostCount > 0 ? `${repostCount} Reposts` : "Repost"}</span>
        </button>

        <button
          data-testid={`recipe-basket-button-${recipeId}`}
          className={mobileTileBase}
          onClick={onAddToBasket}
          title="Add to basket"
          aria-label="Add to basket"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Basket</span>
        </button>

        <button
          data-testid={`recipe-planner-button-${recipeId}`}
          className={mobileTileBase}
          onClick={() => { trackEvent("recipe_added_to_planner", { recipe_id: recipeId }); onAddToPlanner() }}
          title="Add to planner"
          aria-label="Add to planner"
        >
          <CalendarDays className="h-4 w-4" />
          <span>Planner</span>
        </button>

        <button
          className={mobileTileActive.share}
          onClick={handleShare}
          title="Copy link"
        >
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          <span>{copied ? "Copied" : "Share"}</span>
        </button>
      </div>

      <div className="hidden flex-wrap gap-2 sm:flex">
        {/* Save */}
        <button
          data-tutorial="recipe-favorite"
          type="button"
          className={isFavorite ? activeRedClass : neutralClass}
          onClick={onSaveClick}
          disabled={isSaving}
          title={isFavorite ? "Manage your saved folders" : "Save recipe"}
        >
          <Bookmark className={clsx("h-4 w-4", isFavorite ? "fill-current" : "")} />
          <span>{isSaving ? "Saving" : isFavorite ? "Saved" : "Save"}</span>
        </button>

        {/* Like */}
        <button
          className={isLiked ? activeBlueClass : neutralClass}
          onClick={handleLike}
          disabled={!isAuthenticated}
          title={isAuthenticated ? (isLiked ? "Unlike" : "Like") : "Sign in to like"}
        >
          <ThumbsUp className={clsx("h-4 w-4", isLiked ? "fill-current" : "")} />
          <span>{likeCount > 0 ? likeCount : "Like"}</span>
        </button>

        {/* Repost */}
        <button
          data-testid={`recipe-repost-button-${recipeId}`}
          className={isReposted ? activeGreenClass : neutralClass}
          onClick={handleRepost}
          disabled={!isAuthenticated}
          aria-label={isReposted ? "Undo repost" : "Repost"}
          title={isAuthenticated ? (isReposted ? "Undo repost" : "Repost to your followers") : "Sign in to repost"}
        >
          <Repeat2 className="h-4 w-4" />
          <span data-testid={`recipe-repost-count-${recipeId}`}>
            {repostCount > 0 ? repostCount : "Repost"}
          </span>
        </button>

        {/* Basket */}
        <button
          data-testid={`recipe-basket-button-${recipeId}`}
          className={neutralClass}
          onClick={onAddToBasket}
          title="Add to basket"
          aria-label="Add to basket"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Add to Basket</span>
        </button>

        {/* Planner */}
        <button
          data-testid={`recipe-planner-button-${recipeId}`}
          className={neutralClass}
          onClick={() => { trackEvent("recipe_added_to_planner", { recipe_id: recipeId }); onAddToPlanner() }}
          title="Add to planner"
          aria-label="Add to planner"
        >
          <CalendarDays className="h-4 w-4" />
          <span>Add to Planner</span>
        </button>

        {/* Share / copy link */}
        <button
          className={copied ? copiedClass : neutralClass}
          onClick={handleShare}
          title="Copy link"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              <span>Share</span>
            </>
          )}
        </button>
      </div>

      {/* Friend social proof */}
      {friendLikes.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-0.5">
            {friendLikes.slice(0, 4).map((f) => (
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
