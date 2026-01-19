"use client"

import { useState, useMemo, useEffect } from "react"
import { X, Search, Heart, Star } from "lucide-react"
import { RecipeCard } from "@/components/recipe/cards/recipe-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatDietaryTag } from "@/lib/tag-formatter"
import { useRecipesFiltered, type SortBy } from "@/hooks"
import { useRecipeFavoritesDB } from "@/lib/database/recipe-favorites-db"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import type { Recipe } from "@/lib/types"

interface MealType {
  key: string
  label: string
}

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface RecipeSearchPanelProps {
  mealType: string | null
  mealTypes: MealType[]
  favoriteRecipes: Recipe[]
  suggestedRecipes: Recipe[]
  onSelect: (recipe: Recipe) => void
  onMealTypeChange: (mealType: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  activeDragData?: DragData | null
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function RecipeSearchPanel({
  onSelect,
  getDraggableProps,
  activeDragData,
  onToggleCollapse,
}: RecipeSearchPanelProps) {
  const { user } = useAuth()
  const favoritesDB = useRecipeFavoritesDB()

  // Filter state
  const [searchInput, setSearchInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDiet, setSelectedDiet] = useState("all")
  const [sortBy, setSortBy] = useState<SortBy>("created_at")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // Data state
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const [allCuisines, setAllCuisines] = useState<string[]>([])
  const [allDietaryTags, setAllDietaryTags] = useState<string[]>([])

  // Fetch unique cuisine values from recipes
  useEffect(() => {
    const fetchCuisines = async () => {
      try {
        const { data, error } = await supabase
          .from("recipes")
          .select("cuisine")
          .not("cuisine", "is", null)

        if (error) {
          console.error("Error fetching cuisines:", error)
        } else {
          // Extract unique cuisine values
          const cuisines = new Set<string>()
          data?.forEach((recipe: any) => {
            if (recipe.cuisine) {
              cuisines.add(recipe.cuisine)
            }
          })
          setAllCuisines(Array.from(cuisines).sort())
        }
      } catch (error) {
        console.error("Error fetching cuisines:", error)
      }
    }

    fetchCuisines()
  }, [])

  // Fetch all unique dietary tags from recipes
  useEffect(() => {
    const fetchDietaryTags = async () => {
      try {
        const { data } = await supabase
          .from("recipes")
          .select("tags")
          .not("tags", "is", null)

        const tags = new Set<string>()
        data?.forEach((recipe: any) => {
          // tags is an enum array, not a JSONB object
          if (Array.isArray(recipe.tags)) {
            recipe.tags.forEach((tag: string) => {
              tags.add(tag)
            })
          }
        })
        setAllDietaryTags(Array.from(tags).sort())
      } catch (error) {
        console.error("Error fetching dietary tags:", error)
      }
    }

    fetchDietaryTags()
  }, [])

  // Fetch favorite recipes when user changes or favorites toggle changes
  useEffect(() => {
    if (user && showFavoritesOnly) {
      const loadFavorites = async () => {
        setLoadingFavorites(true)
        try {
          const recipes = await favoritesDB.fetchFavoriteRecipes(user.id)
          setFavoriteRecipes(recipes)
        } catch (error) {
          console.error("Error loading favorites:", error)
        } finally {
          setLoadingFavorites(false)
        }
      }
      loadFavorites()
    }
  }, [user, showFavoritesOnly, favoritesDB])

  // Create filters object for database-level filtering
  const filters = useMemo(() => ({
    difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined,
    cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined,
    diet: selectedDiet !== "all" ? selectedDiet : undefined,
    search: searchTerm || undefined,
    limit: 100,
  }), [selectedDifficulty, selectedCuisine, selectedDiet, searchTerm])

  // Fetch all recipes with filters (only when not showing favorites only)
  const { data: allRecipes = [], isLoading: loadingAllRecipes } = useRecipesFiltered(
    sortBy,
    showFavoritesOnly ? { limit: 0 } : filters
  )

  // Use favorites or all recipes based on toggle
  const displayRecipes = showFavoritesOnly ? favoriteRecipes : allRecipes
  const loading = showFavoritesOnly ? loadingFavorites : loadingAllRecipes

  // Available cuisines are already in allCuisines state (sorted)

  const handleSearch = () => {
    setSearchTerm(searchInput)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  const handleClearFilters = () => {
    setSearchInput("")
    setSearchTerm("")
    setSelectedDifficulty("all")
    setSelectedCuisine("all")
    setSelectedDiet("all")
    setSortBy("created_at")
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl overflow-hidden shadow-lg border border-border/30">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/30 flex-shrink-0 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <h3 className="font-semibold text-sm text-foreground">Recipes</h3>
        <Button
          onClick={onToggleCollapse}
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-accent/10"
          aria-label="Close recipe panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Favorites Toggle */}
      <div className="flex gap-2 px-4 py-3 border-b border-border/30 bg-card/50 flex-shrink-0">
        <Button
          variant={!showFavoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFavoritesOnly(false)}
          className="flex-1 h-8 text-xs"
        >
          <Star className="h-3 w-3 mr-1" />
          All Recipes
        </Button>
        <Button
          variant={showFavoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFavoritesOnly(true)}
          className="flex-1 h-8 text-xs"
        >
          <Heart className="h-3 w-3 mr-1" />
          Favorites
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border/30 bg-card/50 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border/30 bg-card/50 flex-shrink-0">
        <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedCuisine} onValueChange={setSelectedCuisine}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Cuisine" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cuisines</SelectItem>
            {allCuisines.map((cuisine) => (
              <SelectItem key={cuisine} value={cuisine}>
                {cuisine}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedDiet} onValueChange={setSelectedDiet}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Diet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Diets</SelectItem>
            {allDietaryTags.map((diet) => (
              <SelectItem key={diet} value={diet}>
                {formatDietaryTag(diet)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
          <SelectTrigger className="h-8 text-xs">
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
          size="sm"
          onClick={handleClearFilters}
          className="h-8 text-xs"
        >
          Clear Filters
        </Button>
      </div>

      {/* Recipe Grid */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : displayRecipes.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 auto-rows-max">
            {displayRecipes.map((recipe) => {
              const isBeingDragged = activeDragData?.source === 'modal' && activeDragData?.recipe.id === recipe.id
              return (
                <div
                  key={recipe.id}
                  onClick={() => onSelect(recipe)}
                >
                  <RecipeCard
                    id={recipe.id}
                    title={recipe.title}
                    image_url={recipe.image_url}
                    rating_avg={recipe.rating_avg}
                    difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                    comments={recipe.rating_count}
                    tags={recipe.tags}
                    nutrition={recipe.nutrition}
                    showFavorite={true}
                    isDragging={isBeingDragged}
                    getDraggableProps={getDraggableProps}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center flex-1 text-center text-muted-foreground px-4">
          <p className="text-sm">
            {showFavoritesOnly
              ? "No favorite recipes yet. Start favoriting recipes to see them here!"
              : searchTerm || selectedDifficulty !== "all" || selectedCuisine !== "all" || selectedDiet !== "all"
              ? "No recipes match your filters. Try adjusting your search criteria."
              : "No recipes available"}
          </p>
        </div>
      )}
    </div>
  )
}
