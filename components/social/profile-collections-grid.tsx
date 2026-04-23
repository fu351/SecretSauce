"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FolderOpen } from "lucide-react"
import type { ProfileCollectionSummary } from "@/lib/social/profile-content"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ProfileCollectionsGridProps {
  username: string
  canViewContent: boolean
}

export function ProfileCollectionsGrid({
  username,
  canViewContent,
}: ProfileCollectionsGridProps) {
  const [collections, setCollections] = useState<ProfileCollectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCollections([])
    setLoading(true)
    setError(null)

    if (!canViewContent) {
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    fetch(`/api/users/${encodeURIComponent(username)}/collections`)
      .then(async (res) => {
        if (res.status === 403) {
          throw new Error("This profile is private.")
        }
        if (!res.ok) {
          throw new Error("Failed to load collections")
        }
        return (await res.json()) as { collections?: ProfileCollectionSummary[] }
      })
      .then((json) => {
        if (!cancelled) setCollections(json.collections ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load collections")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canViewContent, username])

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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl bg-muted animate-pulse" />
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

  if (collections.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No collections yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {collections.map((collection) => (
        <Link
          key={collection.id}
          href={`/saved?collection=${encodeURIComponent(collection.id)}`}
          className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm transition hover:border-primary/30 hover:bg-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <h3 className="truncate font-semibold text-foreground">{collection.name}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {collection.recipe_count} recipe{collection.recipe_count === 1 ? "" : "s"}
              </p>
            </div>
            {collection.is_default ? <Badge variant="secondary">Default</Badge> : null}
          </div>
        </Link>
      ))}
    </div>
  )
}
