"use client"

import { useState, useMemo, useEffect } from "react"
import { X, Search, Heart, Star, SlidersHorizontal, RotateCcw, Utensils } from "lucide-react"
import { RecipeCardCompact } from "@/components/recipe/cards/recipe-card-compact"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
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

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedDifficulty !== "all") count++
    if (selectedCuisine !== "all") count++
    if (selectedDiet !== "all") count++
    return count
  }, [selectedDifficulty, selectedCuisine, selectedDiet])

  // Fetch unique cuisine values
  useEffect(() => {
    const fetchCuisines = async () => {
      const { data } = await supabase.from("recipes").select("cuisine").not("cuisine", "is", null)
      const cuisines = new Set<string>()
      data?.forEach((r: any) => r.cuisine && cuisines.add(r.cuisine))
      setAllCuisines(Array.from(cuisines).sort())
    }
    fetchCuisines()
  }, [])

  // Fetch dietary tags
  useEffect(() => {
    const fetchDietaryTags = async () => {
      const { data } = await supabase.from("recipes").select("tags").not("tags", "is", null)
      const tags = new Set<string>()
      data?.forEach((r: any) => Array.isArray(r.tags) && r.tags.forEach((t: string) => tags.add(t)))
      setAllDietaryTags(Array.from(tags).sort())
    }
    fetchDietaryTags()
  }, [])

  // Fetch favorites
  useEffect(() => {
    if (user && showFavoritesOnly) {
      const loadFavorites = async () => {
        setLoadingFavorites(true)
        try {
          const recipes = await favoritesDB.fetchFavoriteRecipes(user.id)
          setFavoriteRecipes(recipes)
        } finally {
          setLoadingFavorites(false)
        }
      }
      loadFavorites()
    }
  }, [user, showFavoritesOnly, favoritesDB])

  const filters = useMemo(() => ({
    difficulty: selectedDifficulty !== "all" ? selectedDifficulty : undefined,
    cuisine: selectedCuisine !== "all" ? selectedCuisine : undefined,
    diet: selectedDiet !== "all" ? selectedDiet : undefined,
    search: searchTerm || undefined,
    limit: 100,
  }), [selectedDifficulty, selectedCuisine, selectedDiet, searchTerm])

  const { data: allRecipes = [], isLoading: loadingAllRecipes } = useRecipesFiltered(
    sortBy,
    showFavoritesOnly ? { limit: 0 } : filters
  )

  const displayRecipes = showFavoritesOnly ? favoriteRecipes : allRecipes
  const loading = showFavoritesOnly ? loadingFavorites : loadingAllRecipes

  const handleClearFilters = () => {
    setSearchInput("")
    setSearchTerm("")
    setSelectedDifficulty("all")
    setSelectedCuisine("all")
    setSelectedDiet("all")
    setSortBy("created_at")
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950 rounded-2xl overflow-hidden shadow-xl border border-neutral-200 dark:border-neutral-800">
      {/* Header & Main Controls */}
      <div className="flex flex-col bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base tracking-tight text-neutral-900 dark:text-neutral-50">Recipes</h3>
            <div className="flex bg-muted p-1 rounded-lg">
              <button
                onClick={() => setShowFavoritesOnly(false)}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${!showFavoritesOnly ? 'bg-background shadow-sm text-accent' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Browse
              </button>
              <button
                onClick={() => setShowFavoritesOnly(true)}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${showFavoritesOnly ? 'bg-background shadow-sm text-accent' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Heart className={`h-3 w-3 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                Saved
              </button>
            </div>
          </div>
          <Button onClick={onToggleCollapse} variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search & Filter Row */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search recipes..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearchTerm(searchInput)}
              className="pl-9 h-10 text-xs bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-accent/50"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 gap-2 text-xs border-dashed relative">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 bg-accent text-accent-foreground text-[10px] border-2 border-background">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4 space-y-5 shadow-2xl dark:bg-neutral-900 dark:border-neutral-800" align="end">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm dark:text-neutral-50">Refine Search</p>
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-7 px-2 text-[10px] text-neutral-500">
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              </div>
              
              <div className="grid gap-4">
                <FilterSelect label="Difficulty" value={selectedDifficulty} onChange={setSelectedDifficulty}>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </FilterSelect>

                <FilterSelect label="Cuisine" value={selectedCuisine} onChange={setSelectedCuisine}>
                  <SelectItem value="all">All Cuisines</SelectItem>
                  {allCuisines.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </FilterSelect>

                <FilterSelect label="Dietary Preference" value={selectedDiet} onChange={setSelectedDiet}>
                  <SelectItem value="all">Any Diet</SelectItem>
                  {allDietaryTags.map((d) => <SelectItem key={d} value={d}>{formatDietaryTag(d)}</SelectItem>)}
                </FilterSelect>

                <div className="pt-2 border-t dark:border-neutral-800">
                  <FilterSelect label="Sort Results By" value={sortBy} onChange={(v) => setSortBy(v as SortBy)}>
                    <SelectItem value="created_at">Date Added</SelectItem>
                    <SelectItem value="rating_avg">Top Rated</SelectItem>
                    <SelectItem value="prep_time">Cooking Time</SelectItem>
                    <SelectItem value="title">A-Z</SelectItem>
                  </FilterSelect>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto bg-neutral-50/30 dark:bg-neutral-950/30">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : displayRecipes.length > 0 ? (
          <div className="p-4 grid grid-cols-2 gap-4 auto-rows-max">
            {displayRecipes.map((recipe) => (
              <div key={recipe.id} onClick={() => onSelect(recipe)} className="group cursor-pointer">
                <RecipeCardCompact
                  {...recipe}
                  difficulty={recipe.difficulty as any}
                  isDragging={activeDragData?.recipe.id === recipe.id}
                  getDraggableProps={getDraggableProps}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-10 py-20">
            <div className="bg-neutral-100 dark:bg-neutral-900 p-5 rounded-full mb-4">
              <Utensils className="h-10 w-10 text-neutral-300 dark:text-neutral-700" />
            </div>
            <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">No matches found</p>
            <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
              We couldn't find any recipes matching your current filters.
            </p>
            <Button variant="link" size="sm" onClick={handleClearFilters} className="mt-4 text-accent font-bold">
              Clear all filters
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper component for cleaner filter layout
function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-extrabold tracking-widest text-neutral-400 dark:text-neutral-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs dark:bg-neutral-800 dark:border-neutral-700">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="dark:bg-neutral-800">
          {children}
        </SelectContent>
      </Select>
    </div>
  )
}