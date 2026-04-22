"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, FolderPlus, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { recipeCollectionsDB, type RecipeCollectionRow } from "@/lib/database/recipe-favorites-db"

interface RecipeCollectionManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipeId: string
  userId: string | null
  onRecipeSavedChange?: (isSaved: boolean) => void
}

export function RecipeCollectionManager({
  open,
  onOpenChange,
  recipeId,
  userId,
  onRecipeSavedChange,
}: RecipeCollectionManagerProps) {
  const [collections, setCollections] = useState<RecipeCollectionRow[]>([])
  const [activeCollectionIds, setActiveCollectionIds] = useState<Set<string>>(new Set())
  const [newCollectionName, setNewCollectionName] = useState("")
  const [loading, setLoading] = useState(false)
  const [savingCollectionId, setSavingCollectionId] = useState<string | null>(null)

  const activeCount = useMemo(() => activeCollectionIds.size, [activeCollectionIds])

  useEffect(() => {
    onRecipeSavedChange?.(activeCount > 0)
  }, [activeCount, onRecipeSavedChange])

  useEffect(() => {
    if (!open || !userId) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [nextCollections, nextActiveCollections] = await Promise.all([
          recipeCollectionsDB.fetchUserCollectionsWithCounts(userId),
          recipeCollectionsDB.fetchCollectionsForRecipe(userId, recipeId),
        ])

        if (cancelled) return
        setCollections(nextCollections)
        setActiveCollectionIds(new Set(nextActiveCollections.map((collection) => collection.id)))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, userId, recipeId])

  const refresh = async () => {
    if (!userId) return

    const [nextCollections, nextActiveCollections] = await Promise.all([
      recipeCollectionsDB.fetchUserCollectionsWithCounts(userId),
      recipeCollectionsDB.fetchCollectionsForRecipe(userId, recipeId),
    ])

    setCollections(nextCollections)
    setActiveCollectionIds(new Set(nextActiveCollections.map((collection) => collection.id)))
  }

  const toggleCollection = async (collectionId: string) => {
    if (!userId) return

    setSavingCollectionId(collectionId)
    try {
      if (activeCollectionIds.has(collectionId)) {
        await recipeCollectionsDB.removeRecipeFromCollection(collectionId, recipeId)
      } else {
        await recipeCollectionsDB.addRecipeToCollection(collectionId, recipeId)
      }
      await refresh()
    } finally {
      setSavingCollectionId(null)
    }
  }

  const createCollection = async () => {
    if (!userId) return

    const name = newCollectionName.trim()
    if (!name) return

    setLoading(true)
    try {
      const created = await recipeCollectionsDB.createCollection(userId, name)
      if (created) {
        await recipeCollectionsDB.addRecipeToCollection(created.id, recipeId)
        setNewCollectionName("")
        await refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const deleteCollection = async (collectionId: string) => {
    if (!userId) return

    setSavingCollectionId(collectionId)
    try {
      await recipeCollectionsDB.deleteCollection(collectionId)
      await refresh()
    } finally {
      setSavingCollectionId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Save to collections</DialogTitle>
          <DialogDescription>
            Organize recipes into named folders. Recipes can live in more than one collection.
          </DialogDescription>
        </DialogHeader>

        {!userId ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Sign in to create and manage recipe collections.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{activeCount > 0 ? `Saved in ${activeCount} collection${activeCount !== 1 ? "s" : ""}` : "Not saved in any collection"}</span>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            <div className="max-h-[18rem] space-y-2 overflow-y-auto pr-1">
              {collections.length === 0 && !loading ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Create your first folder to start organizing recipes.
                </div>
              ) : null}

              {collections.map((collection) => {
                const active = activeCollectionIds.has(collection.id)
                const isDefault = collection.is_default

                return (
                  <div
                    key={collection.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCollection(collection.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      disabled={savingCollectionId === collection.id}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                        }`}
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{collection.name}</span>
                          {isDefault && <Badge variant="secondary">Default</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {collection.recipe_count} recipe{collection.recipe_count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>

                    {!isDefault ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => deleteCollection(collection.id)}
                        disabled={savingCollectionId === collection.id}
                        aria-label={`Delete ${collection.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <label htmlFor="recipe-collection-name" className="text-sm font-medium">
                Create a new folder
              </label>
              <div className="flex gap-2">
                <Input
                  id="recipe-collection-name"
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  placeholder="Weekend dinners"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void createCollection()
                    }
                  }}
                />
                <Button type="button" onClick={() => void createCollection()} disabled={!newCollectionName.trim()}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Create
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                New folders automatically include the current recipe.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
