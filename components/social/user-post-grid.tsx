"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PostWithMeta } from "@/lib/database/post-db"
import type { ProfilePagedResult } from "@/lib/social/profile-content"
import { Card, CardContent } from "@/components/ui/card"
import { PostCard } from "@/components/social/post-card"

const PAGE_SIZE = 12

interface UserPostGridProps {
  username: string
  canViewContent: boolean
}

export function UserPostGrid({ username, canViewContent }: UserPostGridProps) {
  const [posts, setPosts] = useState<PostWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const offsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const fetchPage = useCallback(
    async (offset: number) => {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/posts?offset=${offset}&limit=${PAGE_SIZE}`
      )

      if (res.status === 403) {
        throw new Error("This profile is private.")
      }

      if (!res.ok) {
        throw new Error("Failed to load posts")
      }

      const json = (await res.json()) as ProfilePagedResult<PostWithMeta> & { posts?: PostWithMeta[] }
      return {
        items: json.items ?? json.posts ?? [],
        hasMore: json.hasMore ?? false,
      }
    },
    [username]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPosts([])
    setHasMore(canViewContent)
    offsetRef.current = 0

    if (!canViewContent) {
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    fetchPage(0)
      .then(({ items, hasMore: more }) => {
        if (cancelled) return
        setPosts(items)
        setHasMore(more)
        offsetRef.current = items.length
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load posts")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canViewContent, fetchPage])

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    if (!canViewContent || !hasMore) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loadingMore) return
        setLoadingMore(true)
        const currentOffset = offsetRef.current

        fetchPage(currentOffset)
          .then(({ items, hasMore: more }) => {
            setPosts((prev) => [...prev, ...items])
            offsetRef.current = currentOffset + items.length
            setHasMore(more)
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Failed to load posts")
          })
          .finally(() => setLoadingMore(false))
      },
      { rootMargin: "300px" }
    )

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [canViewContent, fetchPage, hasMore, loadingMore])

  const mutatePost = useCallback(
    (postId: string, field: "liked_by_viewer" | "reposted_by_viewer") => {
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post

          if (field === "liked_by_viewer") {
            return {
              ...post,
              liked_by_viewer: !post.liked_by_viewer,
              like_count: post.liked_by_viewer ? post.like_count - 1 : post.like_count + 1,
            }
          }

          return {
            ...post,
            reposted_by_viewer: !post.reposted_by_viewer,
            repost_count: post.reposted_by_viewer ? post.repost_count - 1 : post.repost_count + 1,
          }
        })
      )
    },
    []
  )

  const handleLike = useCallback(
    async (postId: string) => {
      mutatePost(postId, "liked_by_viewer")
      try {
        await fetch(`/api/posts/${postId}/like`, { method: "POST" })
      } catch {
        mutatePost(postId, "liked_by_viewer")
      }
    },
    [mutatePost]
  )

  const handleRepost = useCallback(
    async (postId: string) => {
      mutatePost(postId, "reposted_by_viewer")
      try {
        await fetch(`/api/posts/${postId}/repost`, { method: "POST" })
      } catch {
        mutatePost(postId, "reposted_by_viewer")
      }
    },
    [mutatePost]
  )

  if (!canViewContent) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This profile is private.
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-2xl bg-muted animate-pulse h-[420px]" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    )
  }

  if (posts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">No posts yet.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onLike={handleLike} onRepost={handleRepost} />
      ))}

      <div ref={sentinelRef} className="h-1" />

      {loadingMore ? <div className="rounded-2xl bg-muted animate-pulse h-[420px]" /> : null}
    </div>
  )
}
