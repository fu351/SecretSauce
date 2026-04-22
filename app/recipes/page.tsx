"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useIsMobile, useToast } from "@/hooks"
import { RecipeSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { useRecipesFiltered, useRecipesCount, useFavorites, useToggleFavorite, type SortBy } from "@/hooks"
import { useAnalytics } from "@/hooks/use-analytics"
import { Pagination } from "@/components/ui/pagination"
import { RecipeHeader } from "@/components/recipe/recipe-header"
import { RecipeFilterSidebar } from "@/components/recipe/recipe-filter-sidebar"
import { RecipeResultsHeader } from "@/components/recipe/recipe-results-header"
import { RecipeGrid } from "@/components/recipe/recipe-grid"
import { RecipeListView } from "@/components/recipe/recipe-list-view"
import { RecipeEmptyState } from "@/components/recipe/recipe-empty-state"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowDownUp, LayoutGrid, List, Loader2, Search, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"

const RECIPE_FILTER_CACHE_KEY_PREFIX = "recipes-filters:v1:"

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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileSortOpen, setMobileSortOpen] = useState(false)

  const { user } = useAuth()
  const isMobile = useIsMobile()
  const { toast } = useToast()
  const { trackEvent } = useAnalytics()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlUpdateTimer = useRef<NodeJS.Timeout | null>(null)
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const loadingMoreRef = useRef(false)
  const mobileFilterDialogRef = useRef<HTMLDivElement | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Fetch saved recipes
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
    const urlSearch = searchParams.get("search")
    const hasUrlFilters =
      searchParams.has("search") ||
      searchParams.has("difficulty") ||
      searchParams.has("cuisine") ||
      searchParams.has("diet") ||
      searchParams.has("sort") ||
      searchParams.has("saved") ||
      searchParams.has("favorites") ||
      searchParams.has("mine") ||
      searchParams.has("page")

    if (hasUrlFilters) {
      const currentDifficulty = searchParams.get("difficulty") || "all"
      const currentCuisine = searchParams.get("cuisine") || "all"
      const dietParam = searchParams.get("diet")
      const currentDiet = dietParam && dietParam !== "all"
        ? dietParam.split(",").filter(Boolean)
        : []
      const currentSort = (searchParams.get("sort") || "created_at") as SortBy
      const currentPage = parseInt(searchParams.get("page") || "1", 10)
      const currentFavorites =
        searchParams.get("saved") === "true" || searchParams.get("favorites") === "true"
      const currentMine = searchParams.get("mine") === "true"

      setSearchTerm(urlSearch || "")
      setSearchInput(urlSearch || "")
      setSelectedDifficulty(currentDifficulty)
      setSelectedCuisine(currentCuisine)
      setSelectedDiet(currentDiet)
      setSortBy(currentSort)
      setPage(currentPage)
      setShowFavoritesOnly(currentFavorites)
      setShowUserOnly(currentMine)
      return
    }

    if (typeof window === "undefined") return
    if (typeof window.localStorage?.getItem !== "function" || typeof window.localStorage?.removeItem !== "function") return

    const cacheKey = `${RECIPE_FILTER_CACHE_KEY_PREFIX}${user?.id ?? "anon"}`
    const cachedRaw = window.localStorage.getItem(cacheKey)
    if (!cachedRaw) return

    try {
      const cached = JSON.parse(cachedRaw) as {
        searchInput?: string
        searchTerm?: string
        selectedDifficulty?: string
        selectedCuisine?: string
        selectedDiet?: string[]
        sortBy?: SortBy
        showFavoritesOnly?: boolean
        showUserOnly?: boolean
      }
      setSearchInput(cached.searchInput ?? "")
      setSearchTerm(cached.searchTerm ?? "")
      setSelectedDifficulty(cached.selectedDifficulty ?? "all")
      setSelectedCuisine(cached.selectedCuisine ?? "all")
      setSelectedDiet(Array.isArray(cached.selectedDiet) ? cached.selectedDiet : [])
      setSortBy(cached.sortBy ?? "created_at")
      setShowFavoritesOnly(Boolean(cached.showFavoritesOnly))
      setShowUserOnly(Boolean(cached.showUserOnly))
      setPage(1)
    } catch {
      window.localStorage.removeItem(cacheKey)
    }
  }, [searchParams, user?.id])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (typeof window.localStorage?.setItem !== "function") return
    const cacheKey = `${RECIPE_FILTER_CACHE_KEY_PREFIX}${user?.id ?? "anon"}`
    const payload = {
      searchInput,
      searchTerm,
      selectedDifficulty,
      selectedCuisine,
      selectedDiet,
      sortBy,
      showFavoritesOnly,
      showUserOnly,
    }
    window.localStorage.setItem(cacheKey, JSON.stringify(payload))
  }, [user?.id, searchInput, searchTerm, selectedDifficulty, selectedCuisine, selectedDiet, sortBy, showFavoritesOnly, showUserOnly])

  useEffect(() => {
    if (!recipesFetching) {
      setDisplayRecipes((prev) => {
        if (isMobile && page > 1) {
          const merged = [...prev, ...recipes]
          const seen = new Set<string>()
          return merged.filter((recipe) => {
            if (seen.has(recipe.id)) return false
            seen.add(recipe.id)
            return true
          })
        }
        return recipes
      })
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [recipes, recipesFetching, isMobile, page])

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

  useEffect(() => {
    if (!isMobile || !mobileLoadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry.isIntersecting) return
        if (loadingMoreRef.current || recipesFetching || page >= totalPages) return

        loadingMoreRef.current = true
        setIsLoadingMore(true)
        setPage((prev) => {
          const next = prev + 1
          if (next > totalPages) return prev
          updateURL({ page: String(next) })
          return next
        })
      },
      { rootMargin: "240px 0px" }
    )

    observer.observe(mobileLoadMoreRef.current)
    return () => observer.disconnect()
  }, [isMobile, recipesFetching, page, totalPages, updateURL])

  const toggleFavorite = async (recipeId: string, e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save recipes",
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
      trackEvent(isFavorited ? "recipe_removed_from_favorites" : "recipe_added_to_favorites", { recipe_id: recipeId })

      toast({
        title: isFavorited ? "Removed from saved recipes" : "Added to saved recipes",
        description: isFavorited ? "Recipe removed from your saved recipes" : "Recipe added to your saved recipes",
      })
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update saved recipe status",
        variant: "destructive",
      })
    }
  }

  const handleSearch = () => {
    if (searchInput.trim()) trackEvent("recipe_searched", { query: searchInput.trim() })
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

  const activeFilterCount = [
    selectedDifficulty !== "all",
    selectedCuisine !== "all",
    selectedDiet.length > 0,
    showFavoritesOnly,
    showUserOnly,
  ].filter(Boolean).length

  const filterSectionCounts = {
    personal: (showFavoritesOnly ? 1 : 0) + (showUserOnly ? 1 : 0),
    difficulty: selectedDifficulty !== "all" ? 1 : 0,
    cuisine: selectedCuisine !== "all" ? 1 : 0,
    dietary: selectedDiet.length,
  }

  const scrollToFilterSection = (section: "personal" | "difficulty" | "cuisine" | "dietary") => {
    const id = `recipe-mobile-filter-${section}`
    const root = mobileFilterDialogRef.current
    const target = root?.querySelector<HTMLElement>(`#${id}`) ?? document.getElementById(id)
    if (!target) return

    const findScrollableParent = (node: HTMLElement | null): HTMLElement | null => {
      let current = node?.parentElement ?? null
      while (current && current !== root) {
        const style = window.getComputedStyle(current)
        const overflowY = style.overflowY
        const canScroll =
          (overflowY === "auto" || overflowY === "scroll") &&
          current.scrollHeight > current.clientHeight
        if (canScroll) return current
        current = current.parentElement
      }
      return null
    }

    const scrollContainer = findScrollableParent(target)
    if (!scrollContainer) return

    const containerRect = scrollContainer.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const targetTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 8

    scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })
  }

  const sortLabelMap: Record<SortBy, string> = {
    created_at: "Newest",
    rating_avg: "Top Rated",
    prep_time: "Quickest",
    title: "A-Z",
  }

  if (loading && displayRecipes.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          <div className="mb-6 md:mb-8">
            <div className="h-10 w-48 bg-muted rounded animate-pulse mb-2"></div>
            <div className="h-6 w-64 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 md:gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="mb-3 md:mb-4 break-inside-avoid">
                <div
                  className={`w-full rounded-2xl bg-muted animate-pulse ${
                    i % 8 === 0
                      ? "aspect-[2/3]"
                      : i % 8 === 1
                        ? "aspect-[9/16]"
                        : i % 8 === 2
                          ? "aspect-[3/4]"
                          : i % 8 === 3
                            ? "aspect-[4/5]"
                            : i % 8 === 4
                              ? "aspect-square"
                              : i % 8 === 5
                                ? "aspect-[5/6]"
                                : i % 8 === 6
                                  ? "aspect-[7/9]"
                                  : "aspect-[10/13]"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" data-tutorial="recipe-overview">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="mb-4 md:mb-8">
          <RecipeHeader />
        </div>

        <div className="lg:hidden mb-4 space-y-3 sticky top-0 z-20 bg-background/95 backdrop-blur pt-2 pb-2 -mx-4 md:-mx-6 px-4 md:px-6">
          <div className="flex gap-2">
            <div className="relative flex-1" data-tutorial="recipe-mobile-search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recipes"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch()
                }}
                className="pl-9 h-11 rounded-full"
              />
            </div>
            <Button onClick={handleSearch} className="h-11 rounded-full px-5">
              Search
            </Button>
          </div>

          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
            <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-full whitespace-nowrap" data-tutorial="recipe-mobile-filters-button">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </Button>
              </DialogTrigger>
              <DialogContent className="inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 overflow-hidden">
                <div ref={mobileFilterDialogRef} className="flex h-full min-h-0 flex-col" data-tutorial="recipe-mobile-filter-dialog">
                  <DialogHeader className="border-b px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-left">
                    <DialogTitle className="text-base">Filter Recipes</DialogTitle>
                    <p className="text-xs text-muted-foreground">Refine your results</p>
                  </DialogHeader>

                  <div className="border-b bg-background px-3 py-2">
                    <div className="flex gap-2 overflow-x-auto">
                      <Button variant="outline" size="sm" className="rounded-full whitespace-nowrap" onClick={() => scrollToFilterSection("personal")}>
                        Personal{filterSectionCounts.personal > 0 ? ` (${filterSectionCounts.personal})` : ""}
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-full whitespace-nowrap" onClick={() => scrollToFilterSection("difficulty")}>
                        Difficulty{filterSectionCounts.difficulty > 0 ? ` (${filterSectionCounts.difficulty})` : ""}
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-full whitespace-nowrap" onClick={() => scrollToFilterSection("cuisine")}>
                        Cuisine{filterSectionCounts.cuisine > 0 ? ` (${filterSectionCounts.cuisine})` : ""}
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-full whitespace-nowrap" onClick={() => scrollToFilterSection("dietary")}>
                        Dietary{filterSectionCounts.dietary > 0 ? ` (${filterSectionCounts.dietary})` : ""}
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-0 py-0 pb-24">
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
                        updateURL({ saved: newValue ? "true" : undefined }, true)
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
                      showSearchControls={false}
                      showSortControls={false}
                      idPrefix="recipe-mobile-filter"
                      flatContainer
                      showInlineClearButton={false}
                    />
                  </div>

                  <div className="sticky bottom-0 border-t bg-background/95 px-4 pt-3 pb-[env(safe-area-inset-bottom)]">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleClearFilters}
                      >
                        Clear all
                      </Button>
                      <Button
                        className="flex-1"
                        data-tutorial="recipe-mobile-filters-show-results"
                        onClick={() => setMobileFiltersOpen(false)}
                      >
                        Show results
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={mobileSortOpen} onOpenChange={setMobileSortOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-full whitespace-nowrap">
                  <ArrowDownUp className="h-4 w-4 mr-2" />
                  Sort: {sortLabelMap[sortBy]}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Sort Recipes</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  {([
                    ["created_at", "Newest"],
                    ["rating_avg", "Top Rated"],
                    ["prep_time", "Quickest"],
                    ["title", "A-Z"],
                  ] as [SortBy, string][]).map(([value, label]) => (
                    <Button
                      key={value}
                      variant={sortBy === value ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => {
                        setSortBy(value)
                        setPage(1)
                        updateURL({ sort: value }, true)
                        setMobileSortOpen(false)
                        trackEvent("recipe_sort_changed", { sort_by: value })
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant={viewMode === "tile" ? "default" : "outline"}
              size="icon"
              className="rounded-full shrink-0"
              onClick={() => { setViewMode("tile"); trackEvent("view_mode_changed", { mode: "grid", page: "recipes" }) }}
              aria-label="Tile view"
              title="Tile view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "details" ? "default" : "outline"}
              size="icon"
              className="rounded-full shrink-0"
              onClick={() => { setViewMode("details"); trackEvent("view_mode_changed", { mode: "list", page: "recipes" }) }}
              aria-label="Details view"
              title="Details view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="hidden lg:block">
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
                if (value !== "all") trackEvent("recipe_filtered", { filters: { difficulty: value, cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined, dietary: selectedDiet.length > 0 ? selectedDiet : undefined } })
              }}
              selectedCuisine={selectedCuisine}
              onCuisineChange={(value) => {
                setSelectedCuisine(value)
                setPage(1)
                updateURL({ cuisine: value }, true)
                if (value !== "all") trackEvent("recipe_filtered", { filters: { difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined, cuisine: value, dietary: selectedDiet.length > 0 ? selectedDiet : undefined } })
              }}
              selectedDiet={selectedDiet}
              onDietChange={(value) => {
                setSelectedDiet(value)
                setPage(1)
                updateURL({ diet: value.length > 0 ? value.join(",") : undefined }, true)
                if (value.length > 0) trackEvent("recipe_filtered", { filters: { difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined, cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined, dietary: value } })
              }}
              sortBy={sortBy}
              onSortChange={(value) => {
                setSortBy(value as SortBy)
                setPage(1)
                updateURL({ sort: value }, true)
                trackEvent("recipe_sort_changed", { sort_by: value })
              }}
              showFavoritesOnly={showFavoritesOnly}
              onFavoritesToggle={() => {
                const newValue = !showFavoritesOnly
                setShowFavoritesOnly(newValue)
                setPage(1)
                updateURL({ saved: newValue ? "true" : undefined }, true)
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
              idPrefix="recipe-desktop-filter"
            />
          </div>

          <div>
            <RecipeResultsHeader
              totalCount={countFetching ? displayRecipes.length : totalCount}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              searchTerm={searchTerm}
              hasActiveFilters={hasActiveFilters}
              showPagination={!isMobile}
              showSummary={!isMobile}
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

            {isMobile ? (
              totalPages > 1 && displayRecipes.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    {page < totalPages ? (
                      isLoadingMore || recipesFetching ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading more recipes...</span>
                        </>
                      ) : (
                        <span>Scroll down for more</span>
                      )
                    ) : (
                      <span>You've reached the end</span>
                    )}
                  </div>
                  <div ref={mobileLoadMoreRef} className="h-8" />
                </div>
              )
            ) : (
              totalPages > 1 && displayRecipes.length > 0 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={(newPage) => {
                      setPage(newPage)
                      updateURL({ page: String(newPage) })
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                  />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
