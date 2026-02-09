"use client"

import React, { useState, useMemo, useEffect, useCallback, memo } from "react"
import { X, Search, Heart, SlidersHorizontal, RotateCcw, Utensils, Check } from "lucide-react"
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
import { recipeFavoritesDB } from "@/lib/database/recipe-favorites-db"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import type { Recipe } from "@/lib/types"
import { DIETARY_TAGS, CUISINE_TYPES, DIFFICULTY_LEVELS } from "@/lib/types/recipe/constants"

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface RecipeSearchPanelProps {
  onSelect: (recipe: Recipe) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  activeDragData?: DragData | null
  onToggleCollapse?: () => void
  /** Mobile only: ids of recipes selected in current session (show overlay + tick) */
  sessionSelectedIds?: Set<string>
  /** Mobile only: confirm selections and close */
  onConfirmSelections?: () => void
  /** Mobile only: cancel and remove session selections from meal plan */
  onCancelSelections?: () => void
  /** Mobile only: number of recipes selected this session */
  selectionCount?: number
  /** Mobile only: whether to show confirm/cancel bar and selection overlay */
  isMobileMode?: boolean
}

// Memoize the entire panel to prevent parent re-renders from affecting it
export const RecipeSearchPanel = memo(function RecipeSearchPanel({
  onSelect,
  getDraggableProps,
  activeDragData,
  onToggleCollapse,
  sessionSelectedIds,
  onConfirmSelections,
  onCancelSelections,
  selectionCount = 0,
  isMobileMode = false,
}: RecipeSearchPanelProps) {
  const { user } = useAuth()

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

  // 1. DEBOUNCE SEARCH: Only trigger filter update after user stops typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchInput])

  // Removed metadata fetching - now using constants from @/lib/types/recipe/constants

  // 2. CACHE FAVORITES
  useEffect(() => {
    if (user?.id && showFavoritesOnly) {
      let isMounted = true
      setLoadingFavorites(true)
      recipeFavoritesDB.fetchFavoriteRecipes(user.id)
        .then(recipes => { if (isMounted) setFavoriteRecipes(recipes) })
        .finally(() => { if (isMounted) setLoadingFavorites(false) })
      return () => { isMounted = false }
    }
  }, [user?.id, showFavoritesOnly])

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedDifficulty !== "all") count++
    if (selectedCuisine !== "all") count++
    if (selectedDiet !== "all") count++
    return count
  }, [selectedDifficulty, selectedCuisine, selectedDiet])

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

  const handleClearFilters = useCallback(() => {
    setSearchInput("")
    setSearchTerm("")
    setSelectedDifficulty("all")
    setSelectedCuisine("all")
    setSelectedDiet("all")
    setSortBy("created_at")
  }, [])

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <div className="flex flex-col bg-card/80 backdrop-blur-md sticky top-0 z-10 border-b border-border">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base tracking-tight">Recipes</h3>
            <div className="flex bg-muted p-1 rounded-lg">
              <TabButton active={!showFavoritesOnly} onClick={() => setShowFavoritesOnly(false)}>
                Browse
              </TabButton>
              <TabButton active={showFavoritesOnly} onClick={() => setShowFavoritesOnly(true)}>
                <Heart className={cn("h-3 w-3", showFavoritesOnly && "fill-current")} />
                Saved
              </TabButton>
            </div>
          </div>
          <Button onClick={onToggleCollapse} variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 px-4 pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
            <PopoverContent className="w-72 p-4 space-y-5 shadow-2xl bg-card" align="end">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">Refine Search</p>
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-7 px-2 text-[10px] text-muted-foreground">
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              </div>
              
              <div className="grid gap-4">
                <FilterSelect label="Difficulty" value={selectedDifficulty} onChange={setSelectedDifficulty}>
                  <SelectItem value="all">All Levels</SelectItem>
                  {DIFFICULTY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </SelectItem>
                  ))}
                </FilterSelect>

                <FilterSelect label="Cuisine" value={selectedCuisine} onChange={setSelectedCuisine}>
                  <SelectItem value="all">All Cuisines</SelectItem>
                  {CUISINE_TYPES.map((cuisine) => (
                    <SelectItem key={cuisine} value={cuisine}>
                      {cuisine.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </SelectItem>
                  ))}
                </FilterSelect>

                <FilterSelect label="Diet" value={selectedDiet} onChange={setSelectedDiet}>
                  <SelectItem value="all">Any Diet</SelectItem>
                  {DIETARY_TAGS.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {formatDietaryTag(tag)}
                    </SelectItem>
                  ))}
                </FilterSelect>

                <div className="pt-2 border-t border-border">
                  <FilterSelect label="Sort By" value={sortBy} onChange={(v) => setSortBy(v as SortBy)}>
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

      <div className="flex-1 overflow-y-auto bg-muted/30 transform-gpu">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : displayRecipes.length > 0 ? (
          <div className={cn("p-4 grid grid-cols-2 gap-4 auto-rows-max", isMobileMode && selectionCount > 0 && "pb-20")}>
            {displayRecipes.map((recipe) => {
              const isSelected = isMobileMode && sessionSelectedIds?.has(recipe.id)
              return (
                <div key={recipe.id} onClick={() => onSelect(recipe)} className="group cursor-pointer relative">
                  <RecipeCardCompact
                    {...recipe}
                    difficulty={recipe.difficulty as any}
                    isDragging={activeDragData?.recipe.id === recipe.id}
                    getDraggableProps={getDraggableProps}
                  />
                  {isSelected && (
                    <div className="absolute inset-0 rounded-lg bg-black/40 ring-2 ring-primary/60 flex items-center justify-center z-10 pointer-events-none">
                      <div className="rounded-full bg-primary p-2">
                        <Check className="h-6 w-6 text-primary-foreground" strokeWidth={3} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState onClear={handleClearFilters} />
        )}
      </div>

      {isMobileMode && selectionCount > 0 && (onConfirmSelections || onCancelSelections) && (
        <div className="md:hidden sticky bottom-0 left-0 right-0 flex items-center gap-2 p-4 bg-card border-t border-border">
          {onCancelSelections && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
              onClick={onCancelSelections}
            >
              Cancel
            </Button>
          )}
          {onConfirmSelections && (
            <Button
              size="sm"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onConfirmSelections}
            >
              Confirm selected {selectionCount > 0 ? `(${selectionCount})` : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  )
})

// Sub-components to keep render tree lean
const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1",
      active ? "bg-background shadow-sm text-accent" : "text-muted-foreground hover:text-foreground"
    )}
  >
    {children}
  </button>
)

const FilterSelect = memo(({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] uppercase font-extrabold tracking-widest text-muted-foreground">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  </div>
))

const EmptyState = ({ onClear }: { onClear: () => void }) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-10 py-20">
    <div className="bg-muted p-5 rounded-full mb-4">
      <Utensils className="h-10 w-10 text-muted-foreground" />
    </div>
    <p className="text-sm font-bold">No matches found</p>
    <Button variant="link" size="sm" onClick={onClear} className="mt-4 text-accent font-bold">
      Clear all filters
    </Button>
  </div>
)