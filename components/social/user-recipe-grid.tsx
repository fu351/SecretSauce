"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Pin, PinOff } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { RecipeSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { useFavorites, useToggleFavorite } from "@/hooks"
import { useToast } from "@/hooks"
import { PROFILE_PINS_UPDATED_EVENT } from "@/components/social/pinned-recipes-section"
import type { Recipe } from "@/lib/types"

interface Props {
  username: string
  isOwnProfile?: boolean
}

const PAGE_SIZE = 24
const MAX_PINNED = 6

export function UserRecipeGrid({ username, isOwnProfile = false }: Props) {
  const [recipes, setRecipes]         = useState<Recipe[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]         = useState(true)
  const [pinnedIds, setPinnedIds]     = useState<string[]>([])
  const offsetRef                     = useRef(0)
  const sentinelRef                   = useRef<HTMLDivElement | null>(null)
  const observerRef                   = useRef<IntersectionObserver | null>(null)

  const router    = useRouter()
  const { user }  = useAuth()
  const { toast } = useToast()

  const { data: favorites = new Set<string>() } = useFavorites(user?.id ?? null)
  const toggleFavoriteMutation = useToggleFavorite()

  const fetchPage = useCallback(async (offset: number) => {
    const res = await fetch(
      `/api/users/${encodeURIComponent(username)}/recipes?offset=${offset}&limit=${PAGE_SIZE}`
    )
    if (!res.ok) throw new Error("Failed to load recipes")
    return res.json() as Promise<{ recipes: Recipe[]; hasMore: boolean }>
  }, [username])

  // Initial load + fetch current pin state
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRecipes([])
    offsetRef.current = 0

    const loadAll = async () => {
      const [pageResult, pinnedResult] = await Promise.all([
        fetchPage(0),
        isOwnProfile
          ? fetch(`/api/users/${encodeURIComponent(username)}/pinned-recipes`)
              .then((r) => r.json())
              .catch(() => ({ pinnedIds: [] }))
          : Promise.resolve({ pinnedIds: [] }),
      ])
      if (cancelled) return
      setRecipes(pageResult.recipes)
      offsetRef.current = pageResult.recipes.length
      setHasMore(pageResult.hasMore)
      if (isOwnProfile) setPinnedIds(pinnedResult.pinnedIds ?? [])
    }

    loadAll().catch(console.error).finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [fetchPage, username, isOwnProfile])

  // Infinite scroll sentinel
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

  const handlePinToggle = useCallback(
    async (recipeId: string, e?: React.MouseEvent) => {
      e?.preventDefault()
      e?.stopPropagation()

      const alreadyPinned = pinnedIds.includes(recipeId)
      let nextIds: string[]

      if (alreadyPinned) {
        nextIds = pinnedIds.filter((id) => id !== recipeId)
      } else {
        if (pinnedIds.length >= MAX_PINNED) {
          toast({
            title: `Max ${MAX_PINNED} pinned recipes`,
            description: "Unpin a recipe first to pin a new one.",
            variant: "destructive",
          })
          return
        }
        nextIds = [...pinnedIds, recipeId]
      }

      // Optimistic update
      setPinnedIds(nextIds)

      try {
        const res = await fetch("/api/profile/pinned-recipes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinnedRecipeIds: nextIds }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        toast({
          title: alreadyPinned ? "Recipe unpinned" : "Recipe pinned",
          description: alreadyPinned
            ? "Removed from your pinned section."
            : "Added to the top of your profile.",
        })
        window.dispatchEvent(
          new CustomEvent(PROFILE_PINS_UPDATED_EVENT, {
            detail: { username },
          })
        )
      } catch (err: any) {
        setPinnedIds(pinnedIds) // revert
        toast({ title: "Failed to update pins", description: err.message, variant: "destructive" })
      }
    },
    [pinnedIds, toast, username]
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
        onRecipeClick={handleRecipeClick}
        pinnedIds={isOwnProfile ? pinnedIds : undefined}
        onPinToggle={isOwnProfile ? handlePinToggle : undefined}
      />

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
