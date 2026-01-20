"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Heart, Search, Upload, Grid, List, Clock, Users, Star, ChefHat, BarChart3 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks"
import { RecipeCard } from "@/components/recipe/cards/recipe-card"
import { RecipeSkeleton } from "@/components/recipe/cards/recipe-skeleton"
import { DatabaseSetupNotice } from "@/components/shared/database-setup-notice"
import { getRecipeImageUrl } from "@/lib/image-helper"
import Image from "next/image"
import { useRecipesFiltered, useFavorites, useToggleFavorite, type SortBy } from "@/hooks"
import type { Recipe } from "@/lib/types"
import { formatDietaryTag } from "@/lib/tag-formatter"
import { CUISINE_TYPES, DIETARY_TAGS, DIFFICULTY_LEVELS } from "@/lib/types/recipe/constants"

export default function RecipesPage() {
  // UI state
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDiet, setSelectedDiet] = useState("all")
  const [sortBy, setSortBy] = useState<SortBy>("created_at")
  const [viewMode, setViewMode] = useState<"tile" | "details">("tile")
  const [searchInput, setSearchInput] = useState("")

  const { user } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlUpdateTimer = useRef<NodeJS.Timeout | null>(null)

  // Create filters object for database-level filtering
  const filters = useMemo(() => ({
    difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined,
    cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined,
    diet: selectedDiet !== "all" ? selectedDiet : undefined,
    search: searchTerm || undefined,
    limit: 50,
  }), [selectedDifficulty, selectedCuisine, selectedDiet, searchTerm])

  // Use React Query hooks for data fetching with caching
  const { data: recipes = [], isLoading: loading } = useRecipesFiltered(sortBy, filters)
  const { data: favorites = new Set<string>() } = useFavorites(user?.id || null)
  const toggleFavoriteMutation = useToggleFavorite()

  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const currentDifficulty = searchParams.get("difficulty") || "all"
    const currentCuisine = searchParams.get("cuisine") || "all"
    const currentDiet = searchParams.get("diet") || "all"
    const currentSort = (searchParams.get("sort") || "created_at") as SortBy

    setSearchTerm(urlSearch)
    setSelectedDifficulty(currentDifficulty)
    setSelectedCuisine(currentCuisine)
    setSelectedDiet(currentDiet)
    setSortBy(currentSort)
  }, [searchParams])

  const updateURL = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== "all") {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })
      const nextUrl = `/recipes?${params.toString()}`
      if (urlUpdateTimer.current) clearTimeout(urlUpdateTimer.current)
      urlUpdateTimer.current = setTimeout(() => {
        router.replace(nextUrl)
      }, 300)
    },
    [searchParams, router],
  )

  const toggleFavorite = useCallback(
    async (recipeId: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (!user) {
        toast({
          title: "Sign in required",
          description: "Please sign in to favorite recipes.",
          variant: "destructive",
        })
        return
      }

      try {
        await toggleFavoriteMutation.mutateAsync({
          recipeId,
          userId: user.id,
          isFavorited: favorites.has(recipeId),
        })

        toast({
          title: favorites.has(recipeId) ? "Removed from favorites" : "Added to favorites",
          description: favorites.has(recipeId)
            ? "Recipe has been removed from your favorites."
            : "Recipe has been added to your favorites.",
        })
      } catch (error) {
        console.error("Error toggling favorite:", error)
        toast({
          title: "Error",
          description: "Failed to update favorites. Please try again.",
          variant: "destructive",
        })
      }
    },
    [user, favorites, toast, toggleFavoriteMutation],
  )

  // Get all available cuisines and dietary tags from constants
  const cuisineTypes = CUISINE_TYPES
  const dietaryTags = DIETARY_TAGS

  // Helper to capitalize cuisine names for display
  const formatCuisineName = (cuisine: string) => {
    return cuisine
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "beginner":
        return "bg-green-100 text-green-800"
      case "intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getTotalTime = (recipe: Recipe) => {
    return (recipe.prep_time || 0) + (recipe.cook_time || 0)
  }

  const bgClass = theme === "dark" ? "bg-[#181813]" : "bg-gradient-to-br from-orange-50 to-yellow-50"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white/80"
  const buttonClass =
    theme === "dark" ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 hover:bg-orange-600 text-white"
  const inputClass =
    theme === "dark"
      ? "bg-[#1f1e1a] border-[#e8dcc4]/30 text-[#e8dcc4] placeholder:text-[#e8dcc4]/50"
      : "border-gray-200 bg-white"
  const selectClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/30 text-[#e8dcc4]" : "bg-white/50"

  const handleSearch = () => {
    setSearchTerm(searchInput)
    updateURL({ search: searchInput })
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${bgClass}`}>
        <div className="max-w-7xl mx-auto p-6">
          <div className="mb-8">
            <div className="h-10 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-6 w-64 bg-gray-200 rounded animate-pulse"></div>
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
    <div className={`min-h-screen ${bgClass}`}
    data-tutorial="recipe-overview">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`text-4xl font-serif font-light ${textClass} mb-2`}>Recipes</h1>
              <p className={`text-xl ${mutedTextClass}`}>Discover and share amazing recipes</p>
            </div>
            <div className="flex items-center gap-4">
              <Button asChild className={buttonClass}>
                <Link href="/upload-recipe">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Recipe
                </Link>
              </Button>
            </div>
          </div>

          {/*Search Bar*/}
          <div className="relative flex gap-2 items-center mb-8"
          data-tutorial="recipe-search">
            <div className="relative flex-1 max-w-2xl">
              <Search
                className={`absolute left-4 top-1/2 transform -translate-y-1/2 ${theme === "dark" ? "text-[#e8dcc4]/40" : "text-gray-400"} h-5 w-5`}
              />
              <Input
                placeholder="Search recipes by name, ingredient, or cuisine..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className={`pl-12 py-4 text-lg rounded-full ${inputClass} shadow-sm`}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === "tile" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("tile")}
                className={
                  viewMode === "tile"
                    ? buttonClass
                    : theme === "dark"
                      ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#1f1e1a]"
                      : ""
                }
              >
                <Grid className="h-4 w-4 mr-1" />
                Tiles
              </Button>
              <Button
                variant={viewMode === "details" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("details")}
                className={
                  viewMode === "details"
                    ? buttonClass
                    : theme === "dark"
                      ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#1f1e1a]"
                      : ""
                }
              >
                <List className="h-4 w-4 mr-1" />
                Details
              </Button>
            </div>
          </div>
        </div>

        {/*Search filter*/}
        <Card className={`mb-8 ${cardBgClass} backdrop-blur-sm border-0 shadow-lg`} data-tutorial="recipe-filter">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Select
                value={selectedDifficulty}
                onValueChange={(value) => {
                  setSelectedDifficulty(value)
                  updateURL({ difficulty: value })
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={selectedCuisine}
                onValueChange={(value) => {
                  setSelectedCuisine(value)
                  updateURL({ cuisine: value })
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue placeholder="Cuisine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cuisines</SelectItem>
                  {cuisineTypes.map((cuisine) => (
                    <SelectItem key={cuisine} value={cuisine}>
                      {formatCuisineName(cuisine)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedDiet}
                onValueChange={(value) => {
                  setSelectedDiet(value)
                  updateURL({ diet: value })
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue placeholder="Diet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Diets</SelectItem>
                  {dietaryTags.map((diet) => (
                    <SelectItem key={diet} value={diet}>
                      {formatDietaryTag(diet)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as SortBy)
                  updateURL({ sort: value })
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Newest</SelectItem>
                  <SelectItem value="rating_avg">Highest Rated</SelectItem>
                  <SelectItem value="prep_time">Quickest</SelectItem>
                  <SelectItem value="title">Alphabetical</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => {
                  setSearchInput("")
                  setSearchTerm("")
                  setSelectedDifficulty("all")
                  setSelectedCuisine("all")
                  setSelectedDiet("all")
                  router.replace("/recipes")
                }}
                className={selectClass}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6">
          <p className={mutedTextClass}>
            {searchTerm && `Search results for "${searchTerm}" - `}
            Showing {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
            {(selectedDifficulty !== "all" || selectedCuisine !== "all" || selectedDiet !== "all") &&
              " (filtered)"}
          </p>
        </div>

        {/*dev*/}
        {recipes.length === 0 ? (
          <div className="space-y-6">
            {recipes.length === 0 && <DatabaseSetupNotice />}
            <Card
              className={`backdrop-blur-sm border-0 shadow-lg ${theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/10" : "bg-white/80"}`}
            >
              <CardContent className="p-12 text-center">
                <h3 className={`text-lg font-medium ${textClass} mb-2`}>
                  {recipes.length === 0 ? "No recipes in database" : "No recipes found"}
                </h3>
                <p className={`mb-6 ${mutedTextClass}`}>
                  {recipes.length === 0
                    ? "Set up your database to see recipes"
                    : searchTerm
                      ? `No recipes match "${searchTerm}". Try a different search term or adjust your filters.`
                      : "Try adjusting your filters"}
                </p>
                {recipes.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("")
                      setSelectedDifficulty("all")
                      setSelectedCuisine("all")
                      setSelectedDiet("all")
                    }}
                  >
                    Clear All Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ) : viewMode === "tile" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe: Recipe, idx: number) => (
              <div
                key={recipe.id}
                // --- FIX 1: Add ID and h-full here ---
                id={idx === 0 ? "tutorial-recipe-card" : undefined}
                className="relative h-full"
                // -------------------------------------
                data-tutorial={idx === 0 ? "recipe-card" : undefined}
                role="link"
                tabIndex={0}
                title={`Open ${recipe.title}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest("[data-favorite-button]")) return
                  router.push(`/recipes/${recipe.id}`)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    const target = e.target as HTMLElement
                    if (target.closest("[data-favorite-button]")) {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                    router.push(`/recipes/${recipe.id}`)
                  }
                }}
              >
                <RecipeCard
                  id={recipe.id}
                  title={recipe.title}
                  content={recipe.content}
                  rating_avg={recipe.rating_avg || 0}
                  difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                  comments={recipe.rating_count || 0}
                  tags={recipe.tags}
                  nutrition={recipe.nutrition}
                  initialIsFavorited={favorites.has(recipe.id)}
                  skipFavoriteCheck
                  onFavoriteChange={(id, isFav) => toggleFavorite(id, {} as React.MouseEvent)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* --- FIX 2: Add idx to params and ID to wrapper --- */}
            {recipes.map((recipe: Recipe, idx: number) => (
              <div 
                key={recipe.id} 
                className="relative"
                id={idx === 0 ? "tutorial-recipe-card" : undefined}
              >
                <Link
                  href={`/recipes/${recipe.id}`}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (target.closest("[data-favorite-button]")) {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                >
                  <Card
                    className={`group cursor-pointer hover:shadow-xl transition-all duration-300 backdrop-blur-sm border-0 shadow-lg overflow-hidden ${theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white/80"}`}
                  >
                    <CardContent className="p-0">
                      <div className="flex">
                        <div className="w-1/2 relative min-h-[300px]">
                          <Image
                            src={getRecipeImageUrl(recipe.content?.image_url) || "/placeholder.svg"}
                            alt={recipe.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                            loading="lazy"
                          />
                        </div>

                        <div className="w-1/2 p-8 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between mb-4">
                              <h3
                                className={`text-2xl font-bold group-hover:text-orange-600 transition-colors ${textClass}`}
                              >
                                {recipe.title}
                              </h3>
                              <Badge className={getDifficultyColor(recipe.difficulty)}>{recipe.difficulty}</Badge>
                            </div>

                            <p className={`mb-6 line-clamp-3 ${mutedTextClass}`}>{recipe.content?.description}</p>

                            <div className="grid grid-cols-2 gap-6 mb-6">
                              <div className="flex items-center gap-3">
                                <Clock
                                  className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                                />
                                <div>
                                  <p className={`text-sm ${mutedTextClass}`}>Total Time</p>
                                  <p className={`font-semibold ${textClass}`}>{getTotalTime(recipe)} minutes</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <Users
                                  className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                                />
                                <div>
                                  <p className={`text-sm ${mutedTextClass}`}>Servings</p>
                                  <p className={`font-semibold ${textClass}`}>{recipe.servings} servings</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <ChefHat
                                  className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                                />
                                <div>
                                  <p className={`text-sm ${mutedTextClass}`}>Nutrition</p>
                                  <div className={`text-xs space-y-1 ${textClass}`}>
                                    {recipe.nutrition?.calories && <div>{recipe.nutrition.calories} Calories</div>}
                                    {recipe.nutrition?.protein && <div>{recipe.nutrition.protein}g Protein</div>}
                                    {recipe.nutrition?.fat && <div>{recipe.nutrition.fat}g Fat</div>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <BarChart3
                                  className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`}
                                />
                                <div>
                                  <p className={`text-sm ${mutedTextClass}`}>Rating</p>
                                  <div className="flex items-center gap-1">
                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                    <span className={`font-semibold ${textClass}`}>
                                      {(recipe.rating_avg || 0).toFixed(1)}
                                    </span>
                                    <span className={`text-xs ${mutedTextClass}`}>({recipe.rating_count || 0})</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {recipe.tags && recipe.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {recipe.tags.map((tag, index) => (
                                <Badge
                                  key={index}
                                  variant="secondary"
                                  className={
                                    theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-gray-100 text-gray-700"
                                  }
                                >
                                  {formatDietaryTag(tag)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <div className="absolute top-4 right-4 z-10">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-favorite-button
                    className={`bg-white/90 hover:bg-white ${favorites.has(recipe.id) ? "text-red-500" : "text-gray-600"}`}
                    onClick={(e) => toggleFavorite(recipe.id, e)}
                  >
                    <Heart className={`h-4 w-4 ${favorites.has(recipe.id) ? "fill-current" : ""}`} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}