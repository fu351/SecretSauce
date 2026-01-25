"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { RecipeSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { useRecipesFiltered, useRecipesCount, useFavorites, useToggleFavorite, type SortBy } from "@/hooks"
import { Pagination } from "@/components/ui/pagination"
import { RecipeHeader } from "@/components/recipe/recipe-header"
import { RecipeFilterSidebar } from "@/components/recipe/recipe-filter-sidebar"
import { RecipeResultsHeader } from "@/components/recipe/recipe-results-header"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { RecipeListView } from "@/components/recipe/recipe-list-view"
import { RecipeEmptyState } from "@/components/recipe/recipe-empty-state"

export default function RecipesPage() {
  // UI state
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDiet, setSelectedDiet] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortBy>("created_at")
  const [viewMode, setViewMode] = useState<"tile" | "details">("tile")
  const [searchInput, setSearchInput] = useState("")
  const [page, setPage] = useState(1)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [showUserOnly, setShowUserOnly] = useState(false)

  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlUpdateTimer = useRef<NodeJS.Timeout | null>(null)

  // Fetch favorites
  const { data: favorites = new Set<string>() } = useFavorites(user?.id || null)

  // Create filters object for database-level filtering
  const pageSize = 24
  const filters = useMemo(() => ({
    difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined,
    cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined,
    diet: selectedDiet.length > 0 ? selectedDiet : undefined,
    search: searchTerm || undefined,
    favoriteIds: showFavoritesOnly && user ? Array.from(favorites) : undefined,
    authorId: showUserOnly && user ? user.id : undefined,
    page,
    pageSize,
  }), [selectedDifficulty, selectedCuisine, selectedDiet, searchTerm, showFavoritesOnly, favorites, showUserOnly, user, page])

  // Use React Query hooks for data fetching with caching
  const { data: recipes = [], isLoading: loading, isFetching: recipesFetching } = useRecipesFiltered(sortBy, filters)
  const { data: totalCount = 0, isFetching: countFetching } = useRecipesCount({
    difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined,
    cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined,
    diet: selectedDiet.length > 0 ? selectedDiet : undefined,
    search: searchTerm || undefined,
    favoriteIds: showFavoritesOnly && user ? Array.from(favorites) : undefined,
    authorId: showUserOnly && user ? user.id : undefined,
  })
  const toggleFavoriteMutation = useToggleFavorite()

  const totalPages = Math.ceil(totalCount / pageSize)
  const [displayRecipes, setDisplayRecipes] = useState(recipes)

  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const currentDifficulty = searchParams.get("difficulty") || "all"
    const currentCuisine = searchParams.get("cuisine") || "all"
    const dietParam = searchParams.get("diet")
    const currentDiet = dietParam && dietParam !== "all"
      ? dietParam.split(",").filter(Boolean)
      : []
    const currentSort = (searchParams.get("sort") || "created_at") as SortBy
    const currentPage = parseInt(searchParams.get("page") || "1", 10)
    const currentFavorites = searchParams.get("favorites") === "true"
    const currentMine = searchParams.get("mine") === "true"

    setSearchTerm(urlSearch)
    setSelectedDifficulty(currentDifficulty)
    setSelectedCuisine(currentCuisine)
    setSelectedDiet(currentDiet)
    setSortBy(currentSort)
    setPage(currentPage)
    setShowFavoritesOnly(currentFavorites)
    setShowUserOnly(currentMine)
  }, [searchParams])

  useEffect(() => {
    if (!recipesFetching) {
      setDisplayRecipes(recipes)
    }
  }, [recipes, recipesFetching])

  const updateURL = useCallback(
    (updates: Record<string, string | undefined>, resetPage = false) => {
      const params = new URLSearchParams(searchParams.toString())

      // Reset to page 1 if filters change (unless explicitly updating page)
      if (resetPage && !updates.page) {
        params.set("page", "1")
      }

      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== "all" && value !== "false") {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })

      // Remove page parameter if it's page 1
      if (params.get("page") === "1") {
        params.delete("page")
      }

      const nextUrl = `/recipes?${params.toString()}`
      if (urlUpdateTimer.current) clearTimeout(urlUpdateTimer.current)
      urlUpdateTimer.current = setTimeout(() => {
        router.replace(nextUrl, { scroll: false })
      }, 300)
    },
    [searchParams, router],
  )

  const toggleFavorite = async (recipeId: string, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to favorite recipes",
        variant: "destructive",
      })
      return
    }

    const isFavorited = favorites.has(recipeId)

    try {
      await toggleFavoriteMutation.mutateAsync({
        recipeId,
        userId: user.id,
        isFavorited,
      })

      toast({
        title: isFavorited ? "Removed from favorites" : "Added to favorites",
        description: isFavorited ? "Recipe removed from your favorites" : "Recipe added to your favorites",
      })
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      })
    }
  }

  const handleSearch = () => {
    setSearchTerm(searchInput)
    setPage(1)
    updateURL({ search: searchInput }, true)
  }

  const handleClearFilters = () => {
    setSearchInput("")
    setSearchTerm("")
    setSelectedDifficulty("all")
    setSelectedCuisine("all")
    setSelectedDiet([])
    setShowFavoritesOnly(false)
    setShowUserOnly(false)
    setPage(1)
    router.replace("/recipes")
  }

  const hasActiveFilters =
    selectedDifficulty !== "all" ||
    selectedCuisine !== "all" ||
    selectedDiet.length > 0 ||
    showFavoritesOnly ||
    showUserOnly

  if (loading && displayRecipes.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-6">
          <div className="mb-8">
            <div className="h-10 w-48 bg-muted rounded animate-pulse mb-2"></div>
            <div className="h-6 w-64 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <RecipeSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" data-tutorial="recipe-overview">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <RecipeHeader />

        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <RecipeFilterSidebar
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onSearch={handleSearch}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedDifficulty={selectedDifficulty}
            onDifficultyChange={(value) => {
              setSelectedDifficulty(value)
              setPage(1)
              updateURL({ difficulty: value }, true)
            }}
            selectedCuisine={selectedCuisine}
            onCuisineChange={(value) => {
              setSelectedCuisine(value)
              setPage(1)
              updateURL({ cuisine: value }, true)
            }}
            selectedDiet={selectedDiet}
            onDietChange={(value) => {
              setSelectedDiet(value)
              setPage(1)
              updateURL({ diet: value.length > 0 ? value.join(",") : undefined }, true)
            }}
            sortBy={sortBy}
            onSortChange={(value) => {
              setSortBy(value as SortBy)
              setPage(1)
              updateURL({ sort: value }, true)
            }}
            showFavoritesOnly={showFavoritesOnly}
            onFavoritesToggle={() => {
              const newValue = !showFavoritesOnly
              setShowFavoritesOnly(newValue)
              setPage(1)
              updateURL({ favorites: newValue ? "true" : undefined }, true)
            }}
            showUserOnly={showUserOnly}
            onUserRecipesToggle={() => {
              if (!user) {
                toast({
                  title: "Sign in required",
                  description: "Please sign in to view your recipes",
                  variant: "destructive",
                })
                return
              }
              const newValue = !showUserOnly
              setShowUserOnly(newValue)
              setPage(1)
              updateURL({ mine: newValue ? "true" : undefined }, true)
            }}
            onClearFilters={handleClearFilters}
          />

          <div>
            <RecipeResultsHeader
              totalCount={countFetching ? displayRecipes.length : totalCount}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              searchTerm={searchTerm}
              hasActiveFilters={hasActiveFilters}
              onPageChange={(newPage) => {
                setPage(newPage)
                updateURL({ page: String(newPage) })
              }}
            />

            {displayRecipes.length === 0 && !recipesFetching ? (
              <RecipeEmptyState
                hasNoRecipes={totalCount === 0 && !hasActiveFilters}
                searchTerm={searchTerm}
                onClearFilters={handleClearFilters}
              />
            ) : viewMode === "tile" ? (
              <RecipeGrid
                recipes={displayRecipes}
                favorites={favorites}
                onFavoriteToggle={toggleFavorite}
                onRecipeClick={(id) => router.push(`/recipes/${id}`)}
              />
            ) : (
              <RecipeListView
                recipes={displayRecipes}
                favorites={favorites}
                onFavoriteToggle={toggleFavorite}
              />
            )}

            {totalPages > 1 && displayRecipes.length > 0 && (
              <div className="mt-8">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={(newPage) => {
                    setPage(newPage)
                    updateURL({ page: String(newPage) })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
