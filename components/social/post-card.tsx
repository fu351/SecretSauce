"use client"

import Image from "next/image"
import Link from "next/link"
import { Heart, Repeat2, Share2 } from "lucide-react"
import type { PostWithMeta } from "@/lib/database/post-db"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface PostCardProps {
  post: PostWithMeta
  onLike?: (postId: string) => void
  onRepost?: (postId: string) => void
  showAuthorLink?: boolean
}

export function PostCard({
  post,
  onLike,
  onRepost,
  showAuthorLink = true,
}: PostCardProps) {
  const authorName = post.author.full_name ?? "Chef"
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const profileHref = post.author.username ? `/user/${post.author.username}` : null
  const authorContent = (
    <div className="leading-tight">
      <span className="text-sm font-medium text-foreground">{authorName}</span>
      <div className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</div>
    </div>
  )

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {post.author.avatar_url ? (
              <Image
                src={post.author.avatar_url}
                alt={authorName}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                {initials}
              </div>
            )}
            {showAuthorLink && profileHref ? (
              <Link href={profileHref} className="transition-opacity hover:opacity-80">
                {authorContent}
              </Link>
            ) : (
              authorContent
            )}
          </div>
          <Button variant="ghost" size="icon" type="button" disabled>
            <Share2 className="h-4 w-4" />
            <span className="sr-only">Share</span>
          </Button>
        </div>
      </CardHeader>

      <div className="relative w-full aspect-[16/10] bg-muted">
        <Image src={post.image_url} alt={post.title} fill className="object-cover" />
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{post.title}</h3>
          {post.caption ? (
            <p className="text-sm text-muted-foreground">&quot;{post.caption}&quot;</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => onLike?.(post.id)}
            data-testid={`feed-like-button-${post.id}`}
            aria-label={`Like ${post.title}`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted ${
              post.liked_by_viewer ? "text-red-500" : ""
            }`}
          >
            <Heart
              className={`h-4 w-4 ${post.liked_by_viewer ? "fill-red-500 text-red-500" : ""}`}
            />
            <span data-testid={`feed-like-count-${post.id}`}>{post.like_count}</span>
          </button>

          <button
            type="button"
            onClick={() => onRepost?.(post.id)}
            data-testid={`feed-repost-button-${post.id}`}
            aria-label={`Repost ${post.title}`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-muted ${
              post.reposted_by_viewer ? "text-green-500" : ""
            }`}
          >
            <Repeat2
              className={`h-4 w-4 ${post.reposted_by_viewer ? "text-green-500" : ""}`}
            />
            <span data-testid={`feed-repost-count-${post.id}`}>{post.repost_count}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
