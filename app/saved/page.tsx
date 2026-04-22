"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, FolderOpen, Loader2, LayoutGrid, List, RefreshCw, Sparkles } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { recipeCollectionsDB, type RecipeCollectionWithCount } from "@/lib/database/recipe-favorites-db"
import { recipeDB } from "@/lib/database/recipe-db"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import type { Recipe } from "@/lib/types"
import { useAnalytics } from "@/hooks/use-analytics"

export default function SavedRecipesPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { trackEvent } = useAnalytics()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [collections, setCollections] = useState<RecipeCollectionWithCount[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [loadingRecipes, setLoadingRecipes] = useState(false)
  const [sortBy, setSortBy] = useState<"created_at" | "rating_avg" | "prep_time" | "title">("created_at")

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId]
  )

  const mobileCollections = useMemo(() => collections.slice(0, 8), [collections])

  const syncUrl = (collectionId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (collectionId) {
      params.set("collection", collectionId)
    } else {
      params.delete("collection")
    }
    const next = params.toString() ? `/saved?${params.toString()}` : "/saved"
    router.replace(next, { scroll: false })
  }

  const loadCollections = async () => {
    if (!user?.id) {
      setCollections([])
      setSelectedCollectionId(null)
      return
    }

    setLoadingCollections(true)
    try {
      const nextCollections = await recipeCollectionsDB.fetchUserCollectionsWithCounts(user.id)
      setCollections(nextCollections)

      const requestedCollectionId = searchParams.get("collection")
      const nextSelected =
        (requestedCollectionId && nextCollections.some((collection) => collection.id === requestedCollectionId)
          ? requestedCollectionId
          : nextCollections[0]?.id) ?? null

      setSelectedCollectionId(nextSelected)
      if (nextSelected && requestedCollectionId !== nextSelected) {
        syncUrl(nextSelected)
      }
    } catch (error) {
      console.error("Error loading recipe collections:", error)
      setCollections([])
    } finally {
      setLoadingCollections(false)
    }
  }

  const loadRecipesForCollection = async (collectionId: string | null) => {
    if (!user?.id || !collectionId) {
      setSelectedRecipeIds([])
      setRecipes([])
      return
    }

    setLoadingRecipes(true)
    try {
      const recipeIds = await recipeCollectionsDB.fetchCollectionRecipeIds(collectionId)
      setSelectedRecipeIds(recipeIds)

      if (recipeIds.length === 0) {
        setRecipes([])
        return
      }

      const nextRecipes = await recipeDB.fetchRecipes({
        sortBy,
        favoriteIds: recipeIds,
        limit: 100,
      })
      setRecipes(nextRecipes)
    } catch (error) {
      console.error("Error loading recipes for collection:", error)
      setSelectedRecipeIds([])
      setRecipes([])
    } finally {
      setLoadingRecipes(false)
    }
  }

  useEffect(() => {
    void loadCollections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    void loadRecipesForCollection(selectedCollectionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollectionId, sortBy, user?.id])

  useEffect(() => {
    if (!collections.length) return
    const requestedCollectionId = searchParams.get("collection")
    const nextSelected =
      (requestedCollectionId && collections.some((collection) => collection.id === requestedCollectionId)
        ? requestedCollectionId
        : collections[0]?.id) ?? null

    if (nextSelected && nextSelected !== selectedCollectionId) {
      setSelectedCollectionId(nextSelected)
    }
  }, [collections, searchParams, selectedCollectionId])

  const handleToggleRecipe = async (recipeId: string, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()

    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to manage saved recipes.",
        variant: "destructive",
      })
      return
    }

    if (!selectedCollectionId) return

    const isSaved = selectedRecipeIds.includes(recipeId)

    try {
      if (isSaved) {
        await recipeCollectionsDB.removeRecipeFromCollection(selectedCollectionId, recipeId)
      } else {
        await recipeCollectionsDB.addRecipeToCollection(selectedCollectionId, recipeId)
      }

      trackEvent(isSaved ? "recipe_removed_from_favorites" : "recipe_added_to_favorites", {
        recipe_id: recipeId,
        source: "saved_folder",
      })

      await Promise.all([loadCollections(), loadRecipesForCollection(selectedCollectionId)])
    } catch (error) {
      console.error("Error updating folder membership:", error)
      toast({
        title: "Error",
        description: "Failed to update this folder.",
        variant: "destructive",
      })
    }
  }

  const handleSelectCollection = (collectionId: string) => {
    setSelectedCollectionId(collectionId)
    syncUrl(collectionId)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
          <Card className="border-border bg-card">
            <CardContent className="flex flex-col items-start gap-4 p-6">
              <Badge variant="secondary">Saved recipes</Badge>
              <h1 className="text-2xl font-bold text-foreground">Your recipe folders</h1>
              <p className="max-w-2xl text-muted-foreground">
                Sign in to create folders, organize recipes, and browse everything you have saved.
              </p>
              <Button asChild>
                <Link href="/recipes">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Browse recipes
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const isEmpty = !loadingCollections && collections.length === 0

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="h-4 w-4" />
              Recipe folders
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Saved recipes</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Switch between folders, review what is saved in each one, and remove recipes without leaving the page.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/recipes?saved=true">View saved filter</Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/recipes">
                <Sparkles className="mr-2 h-4 w-4" />
                Browse recipes
              </Link>
            </Button>
          </div>
        </div>

        {isEmpty ? (
          <Card className="border-dashed border-border bg-card">
            <CardContent className="flex flex-col items-start gap-4 p-6">
              <Badge variant="secondary">Empty folder list</Badge>
              <div>
                <h2 className="text-lg font-semibold text-foreground">No folders yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Save a recipe from the recipe page to create your first folder, or add one from a recipe detail page.
                </p>
              </div>
              <Button asChild>
                <Link href="/recipes">Start browsing</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 lg:hidden">
              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-foreground">Folders</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingCollections ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading folders
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {mobileCollections.map((collection) => {
                        const active = collection.id === selectedCollectionId
                        return (
                          <button
                            key={collection.id}
                            type="button"
                            onClick={() => handleSelectCollection(collection.id)}
                            className={`shrink-0 rounded-full border px-4 py-2 text-left transition ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background/60 text-foreground hover:bg-background"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="max-w-[10rem] truncate font-medium">{collection.name}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-primary-foreground/15" : "bg-muted"}`}>
                                {collection.recipe_count}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <Card className="hidden border-border bg-card lg:block">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-foreground">Folders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loadingCollections ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading folders
                    </div>
                  ) : (
                    collections.map((collection) => {
                      const active = collection.id === selectedCollectionId
                      return (
                        <button
                          key={collection.id}
                          type="button"
                          onClick={() => handleSelectCollection(collection.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background/60 hover:bg-background"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-foreground">{collection.name}</span>
                              {collection.is_default && <Badge variant="secondary">Default</Badge>}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {collection.recipe_count} recipe{collection.recipe_count === 1 ? "" : "s"}
                            </p>
                          </div>
                          {active ? <LayoutGrid className="h-4 w-4 text-primary" /> : <List className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-foreground">
                      {selectedCollection?.name ?? "Select a folder"}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedCollection
                        ? `${selectedCollection.recipe_count} recipe${selectedCollection.recipe_count === 1 ? "" : "s"} in this folder`
                        : "Choose a folder to view its recipes"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => void loadCollections()} className="w-full sm:w-auto">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSortBy("created_at")}
                      className="w-full sm:w-auto"
                    >
                      Newest
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSortBy("rating_avg")}
                      className="w-full sm:w-auto"
                    >
                      Top rated
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 md:p-6">
                  {loadingRecipes ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading recipes
                    </div>
                  ) : recipes.length > 0 ? (
                    <RecipeGrid
                      recipes={recipes}
                      favorites={new Set(selectedRecipeIds)}
                      onFavoriteToggle={handleToggleRecipe}
                      onRecipeClick={(recipeId) => router.push(`/recipes/${recipeId}`)}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6">
                      <h3 className="text-base font-semibold text-foreground">This folder is empty</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Open a recipe and save it here, or add another recipe from the recipe browser.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild>
                          <Link href="/recipes">
                            <Sparkles className="mr-2 h-4 w-4" />
                            Browse recipes
                          </Link>
                        </Button>
                        <Button asChild variant="outline">
                          <Link href="/saved">View all folders</Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
