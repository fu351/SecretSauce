"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FolderOpen, Loader2, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { recipeCollectionsDB, type RecipeCollectionWithCount } from "@/lib/database/recipe-favorites-db"

interface RecipeCollectionSummaryProps {
  userId: string | null
  className?: string
}

export function RecipeCollectionSummary({ userId, className }: RecipeCollectionSummaryProps) {
  const [collections, setCollections] = useState<RecipeCollectionWithCount[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) {
      setCollections([])
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const nextCollections = await recipeCollectionsDB.fetchUserCollectionsWithCounts(userId)
        if (!cancelled) setCollections(nextCollections)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <Card className={className ?? "border-border bg-card"} data-tutorial="dashboard-collections">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-foreground">Your folders</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Recipes organized by collection</p>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href="/saved">
              <FolderOpen className="mr-2 h-4 w-4" />
              Open folders
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading folders
          </div>
        ) : collections.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {collections.slice(0, 4).map((collection) => (
              <Link
                key={collection.id}
                href={`/saved?collection=${encodeURIComponent(collection.id)}`}
                className="rounded-xl border border-border bg-background/60 p-4 transition hover:border-primary/40 hover:bg-background min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{collection.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {collection.recipe_count} recipe{collection.recipe_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {collection.is_default && <Badge variant="secondary">Default</Badge>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Plus className="h-4 w-4" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-foreground">No folders yet</p>
                <p className="text-sm text-muted-foreground">
                  Save a recipe to create your default folder, or open the folder page to organize recipes.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/saved">Go to folders</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
