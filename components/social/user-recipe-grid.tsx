"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { RecipeSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { useFavorites, useToggleFavorite } from "@/hooks"
import type { Recipe } from "@/lib/types"

interface Props {
  username: string
}

const PAGE_SIZE = 24

export function UserRecipeGrid({ username }: Props) {
  const [recipes, setRecipes]     = useState<Recipe[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]     = useState(true)
  const offsetRef                 = useRef(0)
  const sentinelRef               = useRef<HTMLDivElement | null>(null)
  const observerRef               = useRef<IntersectionObserver | null>(null)

  const router   = useRouter()
  const { user } = useAuth()

  const { data: favorites = new Set<string>() } = useFavorites(user?.id ?? null)
  const toggleFavoriteMutation = useToggleFavorite()

  const fetchPage = useCallback(async (offset: number) => {
    const res = await fetch(
      `/api/users/${encodeURIComponent(username)}/recipes?offset=${offset}&limit=${PAGE_SIZE}`
    )
    if (!res.ok) throw new Error("Failed to load recipes")
    return res.json() as Promise<{ recipes: Recipe[]; hasMore: boolean }>
  }, [username])

  // Initial load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRecipes([])
    offsetRef.current = 0

    fetchPage(0)
      .then(({ recipes: page, hasMore: more }) => {
        if (cancelled) return
        setRecipes(page)
        offsetRef.current = page.length
        setHasMore(more)
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [fetchPage])

  // Infinite scroll — fire when sentinel enters viewport
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loadingMore || !hasMore) return

        setLoadingMore(true)
        const currentOffset = offsetRef.current

        fetchPage(currentOffset)
          .then(({ recipes: page, hasMore: more }) => {
            setRecipes((prev) => [...prev, ...page])
            offsetRef.current = currentOffset + page.length
            setHasMore(more)
          })
          .catch(console.error)
          .finally(() => setLoadingMore(false))
      },
      { rootMargin: "300px" }
    )

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)

    return () => observerRef.current?.disconnect()
  }, [fetchPage, loadingMore, hasMore])

  const handleFavoriteToggle = useCallback(
    async (recipeId: string, e?: React.MouseEvent) => {
      e?.preventDefault()
      e?.stopPropagation()
      if (!user) return
      toggleFavoriteMutation.mutate({ recipeId, userId: user.id, isFavorited: favorites.has(recipeId) })
    },
    [user, favorites, toggleFavoriteMutation]
  )

  const handleRecipeClick = useCallback(
    (recipeId: string) => router.push(`/recipes/${recipeId}`),
    [router]
  )

  if (loading) {
    return (
      <div className="columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mb-3 md:mb-4 break-inside-avoid">
            <RecipeSkeleton />
          </div>
        ))}
      </div>
    )
  }

  if (!loading && recipes.length === 0) {
    return <p className="text-sm text-muted-foreground">No recipes yet.</p>
  }

  return (
    <>
      <RecipeGrid
        recipes={recipes}
        favorites={favorites}
        onFavoriteToggle={handleFavoriteToggle}
        onRecipeClick={handleRecipeClick}
      />

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {loadingMore && (
        <div className="mt-6 columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-3 md:mb-4 break-inside-avoid">
              <RecipeSkeleton />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
