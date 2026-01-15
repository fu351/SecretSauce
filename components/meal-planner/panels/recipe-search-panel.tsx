"use client"

import { useState, useMemo } from "react"
import { X, Search, Leaf, Flame, TreePine, Zap, Apple, Droplet } from "lucide-react"
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

const tagIconMap: Record<string, React.ComponentType<any>> = {
  vegetarian: Leaf,
  vegan: TreePine,
  gluten_free: Zap,
  dairy_free: Droplet,
  keto: Flame,
  paleo: Apple,
}

export function RecipeSearchPanel({
  favoriteRecipes,
  suggestedRecipes,
  onSelect,
  getDraggableProps,
  activeDragData,
  onToggleCollapse,
}: RecipeSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null)
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const allRecipes = [...favoriteRecipes, ...suggestedRecipes]

  // Get unique dietary tags from recipes
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    allRecipes.forEach((recipe) => {
      if (recipe.tags?.dietary && Array.isArray(recipe.tags.dietary)) {
        recipe.tags.dietary.forEach((tag) => tags.add(tag))
      }
    })
    return Array.from(tags)
  }, [allRecipes])

  const filteredRecipes = useMemo(() => {
    return allRecipes.filter((recipe) => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (recipe.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)

      const matchesDifficulty = !difficultyFilter || recipe.difficulty === difficultyFilter

      const matchesDietary = selectedDietaryTags.size === 0 ||
        (recipe.tags?.dietary && Array.isArray(recipe.tags.dietary) &&
         Array.from(selectedDietaryTags).some(tag => recipe.tags?.dietary?.includes(tag)))

      return matchesSearch && matchesDifficulty && matchesDietary
    })
  }, [allRecipes, searchQuery, difficultyFilter, selectedDietaryTags])

  const toggleDietaryTag = (tag: string) => {
    const newTags = new Set(selectedDietaryTags)
    if (newTags.has(tag)) {
      newTags.delete(tag)
    } else {
      newTags.add(tag)
    }
    setSelectedDietaryTags(newTags)
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl overflow-hidden shadow-lg border border-border/30">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/30 flex-shrink-0 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <h3 className="font-semibold text-sm text-text">Recipes</h3>
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

      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-3 px-4 py-3 border-b border-border/30 bg-card/50 flex-shrink-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 text-xs"
          >
            Filters
          </Button>
        </div>

        <Select value={difficultyFilter || "all"} onValueChange={(value) => setDifficultyFilter(value === "all" ? null : value)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All difficulties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dietary Filters */}
      {showFilters && availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border/30 bg-card/50 flex-shrink-0">
          {availableTags.map((tag) => {
            const Icon = tagIconMap[tag] || Leaf
            const isSelected = selectedDietaryTags.has(tag)
            return (
              <button
                key={tag}
                onClick={() => toggleDietaryTag(tag)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  isSelected
                    ? "bg-orange-100 border-orange-300 text-orange-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-orange-300"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{formatDietaryTag(tag)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Recipe Grid - 2x4 (2 rows, 4 columns) */}
      {filteredRecipes.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-4 gap-3 auto-rows-max">
            {filteredRecipes.map((recipe) => {
              const isBeingDragged = activeDragData?.source === 'modal' && activeDragData?.recipe.id === recipe.id
              return (
                <div
                  key={recipe.id}
                  onClick={() => onSelect(recipe)}
                >
                  <RecipeCard
                    id={recipe.id}
                    title={recipe.title}
                    image_url={recipe.image_url || ""}
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
        <div className="flex items-center justify-center flex-1 text-center text-muted-foreground">
          <p className="text-sm">
            {allRecipes.length === 0 ? "No recipes available" : "No recipes match your filters"}
          </p>
        </div>
      )}
    </div>
  )
}
